"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, FileText, Save, Send, Upload, X } from "lucide-react";
import type { WaterUseReportTemplate } from "@/types/database";
import type { Payment } from "@/types/payment";

const quarterSchema = z.object({
  quarter: z.enum(["Q1", "Q2", "Q3", "Q4"]),
  volume_used_m3: z.coerce.number().nonnegative().optional(),
  avg_daily_use_m3_day: z.coerce.number().nonnegative().optional(),
  measurement_method: z.string().optional(),
});

const fishLakeAnnexQuarterSchema = z.object({
  quarter: z.enum(["Q1", "Q2", "Q3", "Q4"]),
  number_of_cages: z.coerce.number().int().nonnegative().optional(),
  capacity_per_cage: z.string().optional(),
  used_surface_ha: z.coerce.number().nonnegative().optional(),
});

const monitoringRowSchema = z.object({
  parameter: z.string(),
  unit: z.string().optional(),
  min: z.coerce.number().optional(),
  max: z.coerce.number().optional(),
  average: z.coerce.number().optional(),
});

const employmentRowSchema = z.object({
  category: z.string(),
  male: z.coerce.number().int().nonnegative().optional(),
  female: z.coerce.number().int().nonnegative().optional(),
  total: z.coerce.number().int().nonnegative().optional(),
});

const formSchema = z.object({
  reporting_year: z.coerce.number().int().min(2000).max(2100),

  section3: z.object({
    operational_status: z.string().optional(),
    total_surface_area_ha: z.coerce.number().nonnegative().optional(),
    changes_during_year: z.boolean().optional(),
    changes_description: z.string().optional(),
    conflict_challenges: z.string().optional(),
    fees_payment_status: z.enum(["paid", "not_paid"]).optional(),
  }),

  section3_quarterly: z.object({
    // Abstraction template
    rows: z.array(quarterSchema).length(4).optional(),
    total_volume_used_m3: z.coerce.number().nonnegative().optional(),
    // Concession template annex (fish farming in lake)
    annex_fish_farming_lake_rows: z.array(fishLakeAnnexQuarterSchema).length(4).optional(),
  }),

  section4: z.object({
    // Abstraction
    efficiency_measures: z.string().optional(),
    recycling_reuse: z.string().optional(),
    estimated_water_saved_m3_year: z.coerce.number().nonnegative().optional(),
    identified_losses: z.string().optional(),
    // Concession
    efficiency_measures_production: z.string().optional(),
    efficiency_measures_ecological: z.string().optional(),
    efficiency_measures_spatial: z.string().optional(),
    reduction_percent_vs_prev_year: z.coerce.number().nonnegative().optional(),
  }),

  section5_practices: z
    .object({
      infrastructure_material: z.enum(["stainless_steel", "wood", "galvanized", "plastic"]).optional(),
      pollution_prevention_practices: z.string().optional(),
    })
    .optional(),

  section5_monitoring: z.object({
    rows: z.array(monitoringRowSchema),
  }),

  section5_incidents: z.object({
    any_incidents: z.enum(["yes", "no"]).optional(),
    date_and_description: z.string().optional(),
    corrective_actions: z.string().optional(),
    date_reported_to_authority: z.string().optional(),
  }),

  section6_employment: z.object({
    rows: z.array(employmentRowSchema),
  }),

  section6_community: z
    .object({
      local_community_engaged: z.string().optional(),
      women_participating: z.string().optional(), // number / %
      community_benefits: z.string().optional(),
      gender_specific_support: z.string().optional(),
    })
    .optional(),

  section6_ohs: z.object({
    gender_inclusive_safety_measures: z.enum(["yes", "no"]).optional(),
    separate_sanitation_facilities: z.enum(["yes", "no"]).optional(),
    grievance_mechanism: z.enum(["yes", "no"]).optional(),
    remarks: z.string().optional(),
  }),

  section7: z.object({
    compliance_with_permit_limits: z.enum(["yes", "no"]).optional(),
    compliance_with_zoning_restrictions: z.enum(["yes", "no"]).optional(),
    environmental_approval_compliance: z.enum(["yes", "no"]).optional(),
    submission_of_monitoring_reports: z.enum(["yes", "no"]).optional(),
    payment_of_water_use_fees: z.enum(["yes", "no"]).optional(),
    remarks: z.string().optional(),
  }),

  section8: z.object({
    planned_changes: z.string().optional(),
    expected_change_percent: z.coerce.number().optional(),
    planned_infrastructure_upgrades: z.string().optional(),
    environmental_improvement_measures: z.string().optional(),
    gender_inclusion_actions: z.string().optional(),
  }),

  section9_declaration: z.object({
    declarant_name: z.string().min(2, { message: "Name is required" }),
    signature: z.string().min(1, { message: "Signature is required" }),
    date: z.string().min(1, { message: "Date is required" }),
    certification: z.boolean().refine((v) => v === true, {
      message: "You must certify that the information provided is true and accurate.",
    }),
  }),
});

// Draft schema - relaxed validation (everything optional except arrays' shape)
const draftSchema = z.object({
  reporting_year: z.coerce.number().int().optional(),
  section3: z.any().optional(),
  section3_quarterly: z.any().optional(),
  section4: z.any().optional(),
  section5_monitoring: z.any().optional(),
  section5_incidents: z.any().optional(),
  section6_employment: z.any().optional(),
  section6_ohs: z.any().optional(),
  section7: z.any().optional(),
  section8: z.any().optional(),
  section9_declaration: z.any().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export interface WaterUseReportGeneralInfoViewModel {
  permitHolderName: string;
  permitNumber: string;
  permitIssueDate: string;
  permitExpiryDate: string;
  reportingYear: number;
  typeOfWaterUse: string;
  waterSourceType: string;
  waterBodyName: string;
  location: {
    province: string;
    district: string;
    sector: string;
    cell: string;
    village?: string;
  };
  contact: {
    name: string;
    position: string;
    telephone: string;
    email: string;
  };
  permitted: {
    maxAbstractionRate_m3_day?: number | null;
    authorizedAnnualVolume_m3_year?: number | null;
    authorizedLakeSurfaceArea_ha?: number | null;
  };
}

interface WaterUseReportFormProps {
  template: WaterUseReportTemplate;
  generalInfo: WaterUseReportGeneralInfoViewModel;
  onSubmit: (data: Omit<FormValues, "reporting_year"> & { reporting_year: number }, status: "submitted") => void | Promise<void>;
  onSaveAsDraft: (data: Partial<FormValues>, status: "draft", isAutoSave?: boolean) => void | Promise<void>;
  onPayNow?: () => void | Promise<void>;
  payment?: Payment | null;
  isLoading: boolean;
  initialData?: Partial<FormValues>;
  mode?: "create" | "edit";
}

export function WaterUseReportForm({
  template,
  generalInfo,
  onSubmit,
  onSaveAsDraft,
  onPayNow,
  payment,
  isLoading,
  initialData,
  mode = "create",
}: WaterUseReportFormProps) {
  const [activeTab, setActiveTab] = useState("general");

  // File: payment proof (for "Paid" path)
  const [paymentProof, setPaymentProof] = useState<File | null>(null);
  const paymentProofRef = useRef<HTMLInputElement>(null);

  const defaultMonitoringRows = useMemo(() => {
    const base = [
      { parameter: "Water Temperature", unit: "°C" },
      { parameter: "Dissolved Oxygen", unit: "mg/L" },
      { parameter: "Turbidity", unit: "NTU" },
    ];
    const concessionExtra = [
      { parameter: "pH", unit: "" },
      { parameter: "Nutrients (Phosphorus and Nitrogen)", unit: "mg/L" },
      { parameter: "BOD", unit: "mg/L" },
    ];
    const other = [{ parameter: "Other (Specify)", unit: "" }];
    const rows =
      template === "concession" ? [...base, ...concessionExtra, ...other] : [...base, ...other];
    return rows.map((r) => ({ ...r, min: undefined, max: undefined, average: undefined }));
  }, [template]);

  const shouldShowFishLakeAnnex = useMemo(() => {
    return generalInfo.typeOfWaterUse === "fish_farming_lakes";
  }, [generalInfo.typeOfWaterUse]);

  const defaultEmploymentRows = useMemo(() => {
    return [
      { category: "Permanent Employees", male: undefined, female: undefined, total: undefined },
      { category: "Temporary / Seasonal Workers", male: undefined, female: undefined, total: undefined },
      { category: "Technical / Skilled Staff", male: undefined, female: undefined, total: undefined },
      { category: "Unskilled / Support Staff", male: undefined, female: undefined, total: undefined },
      { category: "Total Workforce", male: undefined, female: undefined, total: undefined },
    ];
  }, []);

  const defaultValues: FormValues = {
    reporting_year: generalInfo.reportingYear,
    section3: {
      operational_status: "",
      total_surface_area_ha: undefined,
      changes_during_year: undefined,
      changes_description: "",
      conflict_challenges: "",
      fees_payment_status: undefined,
    },
    section3_quarterly: {
      rows:
        template === "abstraction"
          ? ([
              { quarter: "Q1", volume_used_m3: undefined, avg_daily_use_m3_day: undefined, measurement_method: "" },
              { quarter: "Q2", volume_used_m3: undefined, avg_daily_use_m3_day: undefined, measurement_method: "" },
              { quarter: "Q3", volume_used_m3: undefined, avg_daily_use_m3_day: undefined, measurement_method: "" },
              { quarter: "Q4", volume_used_m3: undefined, avg_daily_use_m3_day: undefined, measurement_method: "" },
            ] as any)
          : undefined,
      total_volume_used_m3: undefined,
      annex_fish_farming_lake_rows: shouldShowFishLakeAnnex
        ? ([
            { quarter: "Q1", number_of_cages: undefined, capacity_per_cage: "", used_surface_ha: undefined },
            { quarter: "Q2", number_of_cages: undefined, capacity_per_cage: "", used_surface_ha: undefined },
            { quarter: "Q3", number_of_cages: undefined, capacity_per_cage: "", used_surface_ha: undefined },
            { quarter: "Q4", number_of_cages: undefined, capacity_per_cage: "", used_surface_ha: undefined },
          ] as any)
        : undefined,
    },
    section4: {
      efficiency_measures: "",
      recycling_reuse: "",
      estimated_water_saved_m3_year: undefined,
      identified_losses: "",
      efficiency_measures_production: "",
      efficiency_measures_ecological: "",
      efficiency_measures_spatial: "",
      reduction_percent_vs_prev_year: undefined,
    },
    section5_practices:
      template === "concession"
        ? {
            infrastructure_material: undefined,
            pollution_prevention_practices: "",
          }
        : undefined,
    section5_monitoring: {
      rows: defaultMonitoringRows as any,
    },
    section5_incidents: {
      any_incidents: undefined,
      date_and_description: "",
      corrective_actions: "",
      date_reported_to_authority: "",
    },
    section6_employment: {
      rows: defaultEmploymentRows as any,
    },
    section6_community:
      template === "concession"
        ? {
            local_community_engaged: "",
            women_participating: "",
            community_benefits: "",
            gender_specific_support: "",
          }
        : undefined,
    section6_ohs: {
      gender_inclusive_safety_measures: undefined,
      separate_sanitation_facilities: undefined,
      grievance_mechanism: undefined,
      remarks: "",
    },
    section7: {
      compliance_with_permit_limits: undefined,
      environmental_approval_compliance: undefined,
      submission_of_monitoring_reports: undefined,
      payment_of_water_use_fees: undefined,
      remarks: "",
    },
    section8: {
      planned_changes: "",
      expected_change_percent: undefined,
      planned_infrastructure_upgrades: "",
      environmental_improvement_measures: "",
      gender_inclusion_actions: "",
    },
    section9_declaration: {
      declarant_name: "",
      signature: "",
      date: "",
      certification: false,
    },
  };

  const mergedDefaultValues = initialData ? ({ ...defaultValues, ...initialData } as FormValues) : defaultValues;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: mergedDefaultValues,
  });

  // Auto-save state
  const [lastAutoSave, setLastAutoSave] = useState<Date | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    if (!onSaveAsDraft) return;

    const autoSaveInterval = setInterval(async () => {
      try {
        setAutoSaveStatus("saving");
        const currentValues = form.getValues();
        const validatedData = draftSchema.parse(currentValues);
        await onSaveAsDraft(validatedData as any, "draft", true);
        setLastAutoSave(new Date());
        setAutoSaveStatus("saved");
        setTimeout(() => setAutoSaveStatus("idle"), 2000);
      } catch (e) {
        console.error("Auto-save failed:", e);
        setAutoSaveStatus("error");
        setTimeout(() => setAutoSaveStatus("idle"), 3000);
      }
    }, 30000);

    return () => clearInterval(autoSaveInterval);
  }, [form, onSaveAsDraft]);

  const handleSaveAsDraft = async () => {
    try {
      const currentValues = form.getValues();
      const validatedData = draftSchema.parse(currentValues);
      await onSaveAsDraft(validatedData as any, "draft", false);
    } catch (e) {
      console.error("❌ Error saving draft:", e);
    }
  };

  const handleSubmit = async (values: FormValues) => {
    // Attach payment proof file (if any) through the draft/save payload.
    // The page layer is expected to upload it and persist a reference in section3.
    const payload = values as any;
    if (paymentProof) payload.payment_proof_file = paymentProof;
    await onSubmit(payload, "submitted");
  };

  const removePaymentProof = () => {
    setPaymentProof(null);
    if (paymentProofRef.current) paymentProofRef.current.value = "";
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Card className="border-0 shadow-sm">
        <CardHeader className="space-y-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-2xl flex items-center gap-2">
                <FileText className="h-6 w-6" />
                Annual Water Use Report
              </CardTitle>
              <CardDescription className="mt-2">
                Submit your annual water resources use report in line with Ministerial Order No 001/MoE/24 (Article 12).
              </CardDescription>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge variant="outline" className="capitalize">
                {template === "concession" ? "Concession" : "Abstraction"}
              </Badge>
              <div className="text-xs text-muted-foreground">
                {autoSaveStatus === "saving" ? (
                  <span>Saving…</span>
                ) : autoSaveStatus === "saved" ? (
                  <span className="text-green-700">Saved</span>
                ) : autoSaveStatus === "error" ? (
                  <span className="text-red-600">Save failed</span>
                ) : lastAutoSave ? (
                  <span>Last saved {lastAutoSave.toLocaleTimeString()}</span>
                ) : (
                  <span>Auto-save enabled</span>
                )}
              </div>
            </div>
          </div>
        </CardHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)}>
            <CardContent className="space-y-6">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList className="flex flex-wrap">
                  <TabsTrigger value="general">Section 1</TabsTrigger>
                  <TabsTrigger value="permitted">Section 2</TabsTrigger>
                  <TabsTrigger value="actual">Section 3</TabsTrigger>
                  <TabsTrigger value="efficiency">Section 4</TabsTrigger>
                  <TabsTrigger value="environment">Section 5</TabsTrigger>
                  <TabsTrigger value="social">Section 6</TabsTrigger>
                  <TabsTrigger value="compliance">Section 7</TabsTrigger>
                  <TabsTrigger value="future">Section 8</TabsTrigger>
                  <TabsTrigger value="declaration">Section 9</TabsTrigger>
                </TabsList>

                <TabsContent value="general" className="space-y-6">
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>General Information</AlertTitle>
                    <AlertDescription>
                      This section is filled automatically from your active permit and application data and cannot be edited.
                    </AlertDescription>
                  </Alert>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Name of Permit Holder</Label>
                      <Input value={generalInfo.permitHolderName} disabled />
                    </div>
                    <div className="space-y-2">
                      <Label>Water Use Permit Number</Label>
                      <Input value={generalInfo.permitNumber} disabled />
                    </div>
                    <div className="space-y-2">
                      <Label>Permit Issue Date</Label>
                      <Input value={formatDate(generalInfo.permitIssueDate)} disabled />
                    </div>
                    <div className="space-y-2">
                      <Label>Permit Expiry Date</Label>
                      <Input value={formatDate(generalInfo.permitExpiryDate)} disabled />
                    </div>

                    <FormField
                      control={form.control}
                      name="reporting_year"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Reporting Year</FormLabel>
                          <FormControl>
                            <Input type="number" inputMode="numeric" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="space-y-2">
                      <Label>Type of Water Use</Label>
                      <Input value={generalInfo.typeOfWaterUse} disabled />
                    </div>
                    <div className="space-y-2">
                      <Label>Water Source Type</Label>
                      <Input value={generalInfo.waterSourceType} disabled />
                    </div>
                    <div className="space-y-2">
                      <Label>Name of Water Body</Label>
                      <Input value={generalInfo.waterBodyName} disabled />
                    </div>
                  </div>

                  <div className="rounded-lg border p-4 space-y-4">
                    <div className="font-medium">Administrative Location</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Province</Label>
                        <Input value={generalInfo.location.province} disabled />
                      </div>
                      <div className="space-y-2">
                        <Label>District</Label>
                        <Input value={generalInfo.location.district} disabled />
                      </div>
                      <div className="space-y-2">
                        <Label>Sector</Label>
                        <Input value={generalInfo.location.sector} disabled />
                      </div>
                      <div className="space-y-2">
                        <Label>Cell</Label>
                        <Input value={generalInfo.location.cell} disabled />
                      </div>
                      <div className="space-y-2">
                        <Label>Village</Label>
                        <Input value={generalInfo.location.village || ""} disabled />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border p-4 space-y-4">
                    <div className="font-medium">Contact Person</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input value={generalInfo.contact.name} disabled />
                      </div>
                      <div className="space-y-2">
                        <Label>Position</Label>
                        <Input value={generalInfo.contact.position} disabled />
                      </div>
                      <div className="space-y-2">
                        <Label>Telephone</Label>
                        <Input value={generalInfo.contact.telephone} disabled />
                      </div>
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input value={generalInfo.contact.email} disabled />
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="permitted" className="space-y-6">
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Permitted Water Use Summary</AlertTitle>
                    <AlertDescription>
                      Authorized values are filled from your permit/application and cannot be edited.
                    </AlertDescription>
                  </Alert>

                  {template === "concession" ? (
                    <div className="rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader className="bg-gray-50">
                          <TableRow>
                            <TableHead>Parameter</TableHead>
                            <TableHead>Unit</TableHead>
                            <TableHead>Authorized Value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell>Authorized Lake Surface Area</TableCell>
                            <TableCell>Ha</TableCell>
                            <TableCell>{generalInfo.permitted.authorizedLakeSurfaceArea_ha ?? "—"}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader className="bg-gray-50">
                          <TableRow>
                            <TableHead>Parameter</TableHead>
                            <TableHead>Unit</TableHead>
                            <TableHead>Authorized Value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell>Maximum Abstraction Rate</TableCell>
                            <TableCell>m³/day</TableCell>
                            <TableCell>{generalInfo.permitted.maxAbstractionRate_m3_day ?? "—"}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Authorized Annual Volume</TableCell>
                            <TableCell>m³/year</TableCell>
                            <TableCell>{generalInfo.permitted.authorizedAnnualVolume_m3_year ?? "—"}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="actual" className="space-y-6">
                  <div className="space-y-3">
                    <div className="font-semibold">3.1 Water Use Profile</div>

                    <FormField
                      control={form.control}
                      name="section3.operational_status"
                      render={({ field }) => (
                        <FormItem className="space-y-2">
                          <FormLabel>Operational status</FormLabel>
                          <FormControl>
                            {template === "concession" ? (
                              <RadioGroup onValueChange={field.onChange} value={field.value || ""} className="flex flex-wrap gap-4">
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="fully" id="op_fully" />
                                  <Label htmlFor="op_fully">Fully</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="partial" id="op_partial" />
                                  <Label htmlFor="op_partial">Partial</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="non_operational" id="op_non" />
                                  <Label htmlFor="op_non">Non-Operational</Label>
                                </div>
                              </RadioGroup>
                            ) : (
                              <RadioGroup onValueChange={field.onChange} value={field.value || ""} className="flex flex-wrap gap-4">
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="operational" id="op_yes" />
                                  <Label htmlFor="op_yes">Operational</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="non_operational" id="op_no" />
                                  <Label htmlFor="op_no">Non-operational</Label>
                                </div>
                              </RadioGroup>
                            )}
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {template === "concession" ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Total Surface Area Occupied (Ha)</Label>
                          <FormField
                            control={form.control}
                            name="section3.total_surface_area_ha"
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input
                                    type="number"
                                    inputMode="decimal"
                                    value={field.value ?? ""}
                                    onChange={field.onChange}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Changes During Reporting Year</Label>
                          <FormField
                            control={form.control}
                            name="section3.changes_during_year"
                            render={({ field }) => (
                              <FormItem className="space-y-2">
                                <FormControl>
                                  <RadioGroup
                                    onValueChange={(v) => field.onChange(v === "yes")}
                                    value={field.value === undefined ? "" : field.value ? "yes" : "no"}
                                    className="flex flex-wrap gap-4"
                                  >
                                    <div className="flex items-center space-x-2">
                                      <RadioGroupItem value="yes" id="changes_yes" />
                                      <Label htmlFor="changes_yes">Yes</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <RadioGroupItem value="no" id="changes_no" />
                                      <Label htmlFor="changes_no">No</Label>
                                    </div>
                                  </RadioGroup>
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="md:col-span-2 space-y-2">
                          <Label>If Yes, Describe</Label>
                          <FormField
                            control={form.control}
                            name="section3.changes_description"
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Textarea {...field} />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                    ) : null}

                    <FormField
                      control={form.control}
                      name="section3.conflict_challenges"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Water Use-Related Conflict or Challenges in the Area</FormLabel>
                          <FormControl>
                            <Textarea placeholder="Describe any conflicts or challenges…" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="rounded-lg border p-4 space-y-4">
                      <div className="font-medium">Payment of water fees</div>
                      <FormField
                        control={form.control}
                        name="section3.fees_payment_status"
                        render={({ field }) => (
                          <FormItem className="space-y-2">
                            <FormControl>
                              <RadioGroup onValueChange={field.onChange} value={field.value || ""} className="flex flex-wrap gap-4">
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="paid" id="fees_paid" />
                                  <Label htmlFor="fees_paid">Paid (Attach proof of payment)</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="not_paid" id="fees_not_paid" />
                                  <Label htmlFor="fees_not_paid">Not paid</Label>
                                </div>
                              </RadioGroup>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {form.watch("section3.fees_payment_status") === "paid" ? (
                        <div className="space-y-3">
                          <div className="space-y-2">
                            <Label>Payment proof</Label>
                            <div className="flex items-center gap-3">
                              <Input
                                ref={paymentProofRef}
                                type="file"
                                accept=".pdf,.png,.jpg,.jpeg"
                                onChange={(e) => {
                                  const f = e.target.files?.[0] || null;
                                  setPaymentProof(f);
                                }}
                              />
                            </div>
                          </div>

                          {paymentProof ? (
                            <div className="flex items-center justify-between rounded-md border p-3">
                              <div className="text-sm">
                                <div className="font-medium">{paymentProof.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {(paymentProof.size / 1024 / 1024).toFixed(2)} MB
                                </div>
                              </div>
                              <Button type="button" variant="ghost" size="sm" onClick={removePaymentProof}>
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {form.watch("section3.fees_payment_status") === "not_paid" ? (
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                          <div className="text-sm text-muted-foreground">
                            For non-operational users, the system may close/submit the reporting session after payment proof is provided.
                          </div>
                          <div className="flex items-center gap-2">
                            {payment?.status ? (
                              <Badge variant="outline" className="capitalize">
                                {payment.status}
                              </Badge>
                            ) : null}
                            <Button type="button" onClick={() => onPayNow?.()} disabled={!onPayNow}>
                              <Upload className="mr-2 h-4 w-4" />
                              Pay Now
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="font-semibold">3.2 Quarterly Water Use Data</div>
                    {template === "abstraction" ? (
                      <div className="rounded-lg border overflow-hidden">
                        <Table>
                          <TableHeader className="bg-gray-50">
                            <TableRow>
                              <TableHead>Quarter</TableHead>
                              <TableHead>Volume Used (m³)</TableHead>
                              <TableHead>Average Daily Use (m³/day)</TableHead>
                              <TableHead>Measurement Method</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(form.watch("section3_quarterly.rows") || []).map((row, idx) => (
                              <TableRow key={row.quarter}>
                                <TableCell className="font-medium">{row.quarter}</TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    inputMode="decimal"
                                    value={row.volume_used_m3 ?? ""}
                                    onChange={(e) => {
                                      const v = e.target.value === "" ? undefined : Number(e.target.value);
                                      const rows = [...(form.getValues("section3_quarterly.rows") || [])];
                                      rows[idx] = { ...rows[idx], volume_used_m3: v };
                                      form.setValue("section3_quarterly.rows", rows as any, { shouldDirty: true });
                                    }}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    inputMode="decimal"
                                    value={row.avg_daily_use_m3_day ?? ""}
                                    onChange={(e) => {
                                      const v = e.target.value === "" ? undefined : Number(e.target.value);
                                      const rows = [...(form.getValues("section3_quarterly.rows") || [])];
                                      rows[idx] = { ...rows[idx], avg_daily_use_m3_day: v };
                                      form.setValue("section3_quarterly.rows", rows as any, { shouldDirty: true });
                                    }}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    value={row.measurement_method || ""}
                                    onChange={(e) => {
                                      const rows = [...(form.getValues("section3_quarterly.rows") || [])];
                                      rows[idx] = { ...rows[idx], measurement_method: e.target.value };
                                      form.setValue("section3_quarterly.rows", rows as any, { shouldDirty: true });
                                    }}
                                  />
                                </TableCell>
                              </TableRow>
                            ))}
                            <TableRow>
                              <TableCell className="font-semibold">Total</TableCell>
                              <TableCell>
                                <FormField
                                  control={form.control}
                                  name="section3_quarterly.total_volume_used_m3"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormControl>
                                        <Input type="number" inputMode="decimal" value={field.value ?? ""} onChange={field.onChange} />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                              </TableCell>
                              <TableCell />
                              <TableCell />
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    ) : shouldShowFishLakeAnnex ? (
                      <div className="space-y-3">
                        <div className="font-medium">Annex: Quarterly Data (Fish Farming in Lake)</div>
                        <div className="rounded-lg border overflow-hidden">
                          <Table>
                            <TableHeader className="bg-gray-50">
                              <TableRow>
                                <TableHead>Quarter</TableHead>
                                <TableHead>Number of cages</TableHead>
                                <TableHead>Capacity of each cage</TableHead>
                                <TableHead>Used Surface (Ha)</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(form.watch("section3_quarterly.annex_fish_farming_lake_rows") || []).map((row, idx) => (
                                <TableRow key={row.quarter}>
                                  <TableCell className="font-medium">{row.quarter}</TableCell>
                                  <TableCell>
                                    <Input
                                      type="number"
                                      inputMode="numeric"
                                      value={row.number_of_cages ?? ""}
                                      onChange={(e) => {
                                        const v = e.target.value === "" ? undefined : Number(e.target.value);
                                        const rows = [...(form.getValues("section3_quarterly.annex_fish_farming_lake_rows") || [])];
                                        rows[idx] = { ...rows[idx], number_of_cages: v };
                                        form.setValue("section3_quarterly.annex_fish_farming_lake_rows", rows as any, { shouldDirty: true });
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      value={row.capacity_per_cage || ""}
                                      onChange={(e) => {
                                        const rows = [...(form.getValues("section3_quarterly.annex_fish_farming_lake_rows") || [])];
                                        rows[idx] = { ...rows[idx], capacity_per_cage: e.target.value };
                                        form.setValue("section3_quarterly.annex_fish_farming_lake_rows", rows as any, { shouldDirty: true });
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      type="number"
                                      inputMode="decimal"
                                      value={row.used_surface_ha ?? ""}
                                      onChange={(e) => {
                                        const v = e.target.value === "" ? undefined : Number(e.target.value);
                                        const rows = [...(form.getValues("section3_quarterly.annex_fish_farming_lake_rows") || [])];
                                        rows[idx] = { ...rows[idx], used_surface_ha: v };
                                        form.setValue("section3_quarterly.annex_fish_farming_lake_rows", rows as any, { shouldDirty: true });
                                      }}
                                    />
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        Quarterly abstraction data is not required for the concession template.
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="efficiency" className="space-y-6">
                  <div className="font-semibold">Section 4: Water Use Efficiency and Management</div>
                  {template === "concession" ? (
                    <>
                      <FormField
                        control={form.control}
                        name="section4.efficiency_measures_production"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Water Efficiency Measures Implemented in terms of Production (Outputs)</FormLabel>
                            <FormControl>
                              <Textarea {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="section4.efficiency_measures_ecological"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Water Efficiency Measures Implemented in Terms of Ecological Impacts</FormLabel>
                            <FormControl>
                              <Textarea {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="section4.efficiency_measures_spatial"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Water Efficiency Measures Implemented in Terms of Spatial Occupation</FormLabel>
                            <FormControl>
                              <Textarea {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="section4.reduction_percent_vs_prev_year"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Reduction Compared to the Previous Year (%)</FormLabel>
                            <FormControl>
                              <Input type="number" inputMode="decimal" value={field.value ?? ""} onChange={field.onChange} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </>
                  ) : (
                    <>
                      <FormField
                        control={form.control}
                        name="section4.efficiency_measures"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Water Efficiency Measures Implemented</FormLabel>
                            <FormControl>
                              <Textarea {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="section4.recycling_reuse"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Recycling / Reuse Practices</FormLabel>
                            <FormControl>
                              <Textarea {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="section4.estimated_water_saved_m3_year"

                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Estimated Water Saved (m³/year)</FormLabel>
                              <FormControl>
                                <Input type="number" inputMode="decimal" value={field.value ?? ""} onChange={field.onChange} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="section4.reduction_percent_vs_prev_year"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Reduction Compared to Previous Year (%)</FormLabel>
                              <FormControl>
                                <Input type="number" inputMode="decimal" value={field.value ?? ""} onChange={field.onChange} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name="section4.identified_losses"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Identified Losses (Leakage, Evaporation, etc.)</FormLabel>
                            <FormControl>
                              <Textarea {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </>
                  )}
                </TabsContent>

                <TabsContent value="environment" className="space-y-6">
                  <div className="font-semibold">Section 5: Environmental Compliance and Monitoring</div>

                  {template === "concession" ? (
                    <div className="space-y-3">
                      <div className="font-medium">5.1 Environmental Practices</div>
                      <FormField
                        control={form.control}
                        name="section5_practices.infrastructure_material"
                        render={({ field }) => (
                          <FormItem className="space-y-2">
                            <FormLabel>Nature/property of the used infrastructure/equipment offshore</FormLabel>
                            <FormControl>
                              <RadioGroup onValueChange={field.onChange} value={field.value || ""} className="flex flex-wrap gap-4">
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="stainless_steel" id="mat_ss" />
                                  <Label htmlFor="mat_ss">Stainless steel</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="wood" id="mat_wood" />
                                  <Label htmlFor="mat_wood">Wood</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="galvanized" id="mat_galv" />
                                  <Label htmlFor="mat_galv">Galvanized</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="plastic" id="mat_plastic" />
                                  <Label htmlFor="mat_plastic">Plastic</Label>
                                </div>
                              </RadioGroup>
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="section5_practices.pollution_prevention_practices"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Pollution prevention & control practices</FormLabel>
                            <FormControl>
                              <Textarea {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  ) : null}

                  <div className="space-y-3">
                    <div className="font-medium">{template === "concession" ? "5.2 Environmental Monitoring Results" : "5.1 Environmental Monitoring Results"}</div>
                    <div className="rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader className="bg-gray-50">
                          <TableRow>
                            <TableHead>Parameter</TableHead>
                            <TableHead>Unit</TableHead>
                            <TableHead>Min</TableHead>
                            <TableHead>Max</TableHead>
                            <TableHead>Average</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {form.watch("section5_monitoring.rows").map((row, idx) => (
                            <TableRow key={`${row.parameter}-${idx}`}>
                              <TableCell className="font-medium">{row.parameter}</TableCell>
                              <TableCell>{row.unit || ""}</TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  inputMode="decimal"
                                  value={row.min ?? ""}
                                  onChange={(e) => {
                                    const v = e.target.value === "" ? undefined : Number(e.target.value);
                                    const rows = [...form.getValues("section5_monitoring.rows")];
                                    rows[idx] = { ...rows[idx], min: v };
                                    form.setValue("section5_monitoring.rows", rows as any, { shouldDirty: true });
                                  }}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  inputMode="decimal"
                                  value={row.max ?? ""}
                                  onChange={(e) => {
                                    const v = e.target.value === "" ? undefined : Number(e.target.value);
                                    const rows = [...form.getValues("section5_monitoring.rows")];
                                    rows[idx] = { ...rows[idx], max: v };
                                    form.setValue("section5_monitoring.rows", rows as any, { shouldDirty: true });
                                  }}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  inputMode="decimal"
                                  value={row.average ?? ""}
                                  onChange={(e) => {
                                    const v = e.target.value === "" ? undefined : Number(e.target.value);
                                    const rows = [...form.getValues("section5_monitoring.rows")];
                                    rows[idx] = { ...rows[idx], average: v };
                                    form.setValue("section5_monitoring.rows", rows as any, { shouldDirty: true });
                                  }}
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="font-medium">{template === "concession" ? "5.3 Environmental Incidents" : "5.2 Environmental Incidents"}</div>
                    <FormField
                      control={form.control}
                      name="section5_incidents.any_incidents"
                      render={({ field }) => (
                        <FormItem className="space-y-2">
                          <FormLabel>Any pollution, spills, or accidents?</FormLabel>
                          <FormControl>
                            <RadioGroup onValueChange={field.onChange} value={field.value || ""} className="flex flex-wrap gap-4">
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="yes" id="inc_yes" />
                                <Label htmlFor="inc_yes">Yes</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="no" id="inc_no" />
                                <Label htmlFor="inc_no">No</Label>
                              </div>
                            </RadioGroup>
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="section5_incidents.date_and_description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Date and description (if any)</FormLabel>
                          <FormControl>
                            <Textarea {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="section5_incidents.corrective_actions"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Corrective actions taken</FormLabel>
                          <FormControl>
                            <Textarea {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="section5_incidents.date_reported_to_authority"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Date reported to Authority</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="YYYY-MM-DD" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="social" className="space-y-6">
                  <div className="font-semibold">Section 6: Social and Gender-Disaggregated Information</div>

                  <div className="space-y-3">
                    <div className="font-medium">6.1 Employment Related to Water Use Activity</div>
                    <div className="rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader className="bg-gray-50">
                          <TableRow>
                            <TableHead>Category</TableHead>
                            <TableHead>Male</TableHead>
                            <TableHead>Female</TableHead>
                            <TableHead>Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {form.watch("section6_employment.rows").map((row, idx) => (
                            <TableRow key={`${row.category}-${idx}`}>
                              <TableCell className="font-medium">{row.category}</TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  inputMode="numeric"
                                  value={row.male ?? ""}
                                  onChange={(e) => {
                                    const v = e.target.value === "" ? undefined : Number(e.target.value);
                                    const rows = [...form.getValues("section6_employment.rows")];
                                    rows[idx] = { ...rows[idx], male: v };
                                    form.setValue("section6_employment.rows", rows as any, { shouldDirty: true });
                                  }}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  inputMode="numeric"
                                  value={row.female ?? ""}
                                  onChange={(e) => {
                                    const v = e.target.value === "" ? undefined : Number(e.target.value);
                                    const rows = [...form.getValues("section6_employment.rows")];
                                    rows[idx] = { ...rows[idx], female: v };
                                    form.setValue("section6_employment.rows", rows as any, { shouldDirty: true });
                                  }}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  inputMode="numeric"
                                  value={row.total ?? ""}
                                  onChange={(e) => {
                                    const v = e.target.value === "" ? undefined : Number(e.target.value);
                                    const rows = [...form.getValues("section6_employment.rows")];
                                    rows[idx] = { ...rows[idx], total: v };
                                    form.setValue("section6_employment.rows", rows as any, { shouldDirty: true });
                                  }}
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  {template === "concession" ? (
                    <div className="space-y-3">
                      <div className="font-medium">6.2 Community Engagement and Benefits</div>
                      <FormField
                        control={form.control}
                        name="section6_community.local_community_engaged"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Local community members engaged</FormLabel>
                            <FormControl>
                              <Textarea {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="section6_community.women_participating"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Women participating in consultations (Number / %)</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="section6_community.community_benefits"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Community benefits linked to water use</FormLabel>
                            <FormControl>
                              <Textarea {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="section6_community.gender_specific_support"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Gender-specific support measures</FormLabel>
                            <FormControl>
                              <Textarea {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  ) : null}

                  <div className="space-y-3">
                    <div className="font-medium">{template === "concession" ? "6.3 Occupational Health and Safety (Gender-Sensitive)" : "6.2 Occupational Health and Safety (Gender-Sensitive)"}</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="section6_ohs.gender_inclusive_safety_measures"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Gender-inclusive safety measures are in place</FormLabel>
                            <FormControl>
                              <RadioGroup onValueChange={field.onChange} value={field.value || ""} className="flex gap-4">
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="yes" id="ohs_1y" />
                                  <Label htmlFor="ohs_1y">Yes</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="no" id="ohs_1n" />
                                  <Label htmlFor="ohs_1n">No</Label>
                                </div>
                              </RadioGroup>
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="section6_ohs.separate_sanitation_facilities"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Separate Sanitation Facilities</FormLabel>
                            <FormControl>
                              <RadioGroup onValueChange={field.onChange} value={field.value || ""} className="flex gap-4">
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="yes" id="ohs_2y" />
                                  <Label htmlFor="ohs_2y">Yes</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="no" id="ohs_2n" />
                                  <Label htmlFor="ohs_2n">No</Label>
                                </div>
                              </RadioGroup>
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="section6_ohs.grievance_mechanism"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Gender-responsive Grievance Mechanism</FormLabel>
                            <FormControl>
                              <RadioGroup onValueChange={field.onChange} value={field.value || ""} className="flex gap-4">
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="yes" id="ohs_3y" />
                                  <Label htmlFor="ohs_3y">Yes</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="no" id="ohs_3n" />
                                  <Label htmlFor="ohs_3n">No</Label>
                                </div>
                              </RadioGroup>
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="section6_ohs.remarks"
                        render={({ field }) => (
                          <FormItem className="md:col-span-2">
                            <FormLabel>Remarks</FormLabel>
                            <FormControl>
                              <Textarea {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="compliance" className="space-y-6">
                  <div className="font-semibold">Section 7: Compliance Status</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(
                      [
                        ["section7.compliance_with_permit_limits", "Compliance with permit limits"],
                        ...(template === "concession"
                          ? ([["section7.compliance_with_zoning_restrictions", "Compliance with zoning restrictions"]] as const)
                          : ([] as const)),
                        ["section7.environmental_approval_compliance", "Environmental approval compliance"],
                        ["section7.submission_of_monitoring_reports", "Submission of monitoring reports"],
                        ["section7.payment_of_water_use_fees", "Payment of water use fees"],
                      ] as const
                    ).map(([name, labelText]) => (
                      <FormField
                        key={name}
                        control={form.control}
                        name={name as any}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{labelText}</FormLabel>
                            <FormControl>
                              <RadioGroup onValueChange={field.onChange} value={field.value || ""} className="flex gap-4">
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="yes" id={`${name}-y`} />
                                  <Label htmlFor={`${name}-y`}>Yes</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="no" id={`${name}-n`} />
                                  <Label htmlFor={`${name}-n`}>No</Label>
                                </div>
                              </RadioGroup>
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    ))}

                    <FormField
                      control={form.control}
                      name="section7.remarks"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel>Remarks</FormLabel>
                          <FormControl>
                            <Textarea {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="future" className="space-y-6">
                  <div className="font-semibold">Section 8: Future Plans (Next Reporting Year)</div>
                  <FormField
                    control={form.control}
                    name="section8.planned_changes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Planned changes in water use</FormLabel>
                        <FormControl>
                          <Textarea {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="section8.expected_change_percent"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Expected increase/decrease (%)</FormLabel>
                        <FormControl>
                          <Input type="number" inputMode="decimal" value={field.value ?? ""} onChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="section8.planned_infrastructure_upgrades"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Planned infrastructure upgrades</FormLabel>
                        <FormControl>
                          <Textarea {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="section8.environmental_improvement_measures"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Environmental improvement measures</FormLabel>
                        <FormControl>
                          <Textarea {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="section8.gender_inclusion_actions"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Planned actions to enhance gender inclusion</FormLabel>
                        <FormControl>
                          <Textarea {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </TabsContent>

                <TabsContent value="declaration" className="space-y-6">
                  <Alert className="border-amber-200 bg-amber-50">
                    <AlertCircle className="h-4 w-4 text-amber-700" />
                    <AlertTitle className="text-amber-900">Declaration</AlertTitle>
                    <AlertDescription className="text-amber-900">
                      I hereby certify that the information provided in this report is true, accurate, complete, and complies with the conditions of the Water Use Permit.
                    </AlertDescription>
                  </Alert>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="section9_declaration.declarant_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="section9_declaration.signature"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Signature</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="section9_declaration.date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Date</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="YYYY-MM-DD" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="section9_declaration.certification"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2 flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>I certify the information is true and accurate</FormLabel>
                            <FormMessage />
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>

            <CardFooter className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-t bg-gray-50/50">
              <div className="text-xs text-muted-foreground">
                {mode === "create"
                  ? "Your progress is automatically saved every 30 seconds as a draft."
                  : "Edits are saved as a draft automatically every 30 seconds."}
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={handleSaveAsDraft} disabled={isLoading}>
                  <Save className="mr-2 h-4 w-4" />
                  Save Draft
                </Button>
                <Button type="submit" disabled={isLoading}>
                  <Send className="mr-2 h-4 w-4" />
                  Submit Report
                </Button>
              </div>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </motion.div>
  );
}


