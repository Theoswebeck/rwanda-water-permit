"use client";

import { useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
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
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Save, 
  Send, 
  User, 
  Droplets, 
  BarChart3, 
  Leaf, 
  Users, 
  CheckSquare, 
  Calendar,
  FileSignature,
  Loader2,
  Info
} from "lucide-react";
import type { PermitWithApplication } from "@/hooks/usePermitsQuery";
import type { WaterUseReportTemplate, WaterUseReport } from "@/types/database";
import { getWaterUseTypeOptions, getWaterSourceTypeOptions } from "@/hooks/useWaterUseReports";

interface WaterUseReportFormProps {
  permit: PermitWithApplication;
  template: WaterUseReportTemplate;
  reportingYear: number;
  existingReport?: WaterUseReport | null;
  onSaveAsDraft: (data: any) => Promise<void>;
  onSubmit: (data: any) => Promise<void>;
  isLoading?: boolean;
  isReadOnly?: boolean;
}

// Helper to format date
const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

export function WaterUseReportForm({
  permit,
  template,
  reportingYear,
  existingReport,
  onSaveAsDraft,
  onSubmit,
  isLoading = false,
  isReadOnly = false,
}: WaterUseReportFormProps) {
  const [activeTab, setActiveTab] = useState("section1");

  // Form state - organized by sections
  const [formData, setFormData] = useState(() => {
    // Initialize from existing report or defaults
    return {
      reportingYear,
      // Section 3 - Actual Water Use
      section3: existingReport?.section3 || {
        operationalStatus: '',
        waterUseConflicts: '',
        paymentStatus: 'not_paid',
        // Concession-specific
        totalSurfaceAreaOccupied: '',
        changesduringYear: false,
        changesDescription: '',
      },
      section3_quarterly: existingReport?.section3_quarterly || {
        q1: { volume: '', avgDaily: '', method: '' },
        q2: { volume: '', avgDaily: '', method: '' },
        q3: { volume: '', avgDaily: '', method: '' },
        q4: { volume: '', avgDaily: '', method: '' },
        // Concession fish farming quarterly
        q1_fish: { cages: '', capacity: '', surface: '' },
        q2_fish: { cages: '', capacity: '', surface: '' },
        q3_fish: { cages: '', capacity: '', surface: '' },
        q4_fish: { cages: '', capacity: '', surface: '' },
      },
      // Section 4 - Water Use Efficiency
      section4: existingReport?.section4 || {
        efficiencyMeasures: '',
        recyclingPractices: '',
        estimatedWaterSaved: '',
        reductionPercentage: '',
        identifiedLosses: '',
        // Concession-specific
        productionOutputMeasures: '',
        ecologicalImpactMeasures: '',
        spatialOccupationMeasures: '',
      },
      // Section 5 - Environmental Compliance
      section5_monitoring: existingReport?.section5_monitoring || {
        waterTemperature: { min: '', max: '', avg: '' },
        dissolvedOxygen: { min: '', max: '', avg: '' },
        turbidity: { min: '', max: '', avg: '' },
        ph: { min: '', max: '', avg: '' },
        nutrients: { min: '', max: '', avg: '' },
        bod: { min: '', max: '', avg: '' },
        other: { parameter: '', min: '', max: '', avg: '' },
        // Concession-specific
        infrastructureNature: [],
        pollutionPrevention: '',
      },
      section5_incidents: existingReport?.section5_incidents || {
        hasIncidents: false,
        incidentDate: '',
        incidentDescription: '',
        correctiveActions: '',
        dateReportedToAuthority: '',
      },
      // Section 6 - Social & Gender
      section6_employment: existingReport?.section6_employment || {
        permanentMale: '',
        permanentFemale: '',
        temporaryMale: '',
        temporaryFemale: '',
        technicalMale: '',
        technicalFemale: '',
        unskilledMale: '',
        unskilledFemale: '',
        // Concession-specific
        communityEngaged: '',
        womenInConsultations: '',
        communityBenefits: '',
        genderSupportMeasures: '',
      },
      section6_ohs: existingReport?.section6_ohs || {
        genderInclusiveSafety: false,
        genderInclusiveSafetyRemarks: '',
        separateSanitation: false,
        separateSanitationRemarks: '',
        genderGrievance: false,
        genderGrievanceRemarks: '',
      },
      // Section 7 - Compliance Status
      section7: existingReport?.section7 || {
        permitLimitsCompliance: false,
        permitLimitsRemarks: '',
        zoningCompliance: false,
        zoningRemarks: '',
        environmentalApprovalCompliance: false,
        environmentalApprovalRemarks: '',
        monitoringReportsCompliance: false,
        monitoringReportsRemarks: '',
        waterFeesCompliance: false,
        waterFeesRemarks: '',
      },
      // Section 8 - Future Plans
      section8: existingReport?.section8 || {
        plannedChanges: '',
        expectedChangePercentage: '',
        plannedInfrastructureUpgrades: '',
        environmentalImprovements: '',
        genderInclusionActions: '',
      },
      // Section 9 - Declaration
      section9_declaration: existingReport?.section9_declaration || {
        declarantName: '',
        declarationDate: new Date().toISOString().split('T')[0],
        agreed: false,
      },
    };
  });

  // Update form data helper
  const updateFormData = useCallback((section: string, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [section]: {
        ...(prev as any)[section],
        [field]: value,
      },
    }));
  }, []);

  // Update nested form data helper
  const updateNestedFormData = useCallback((section: string, parent: string, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [section]: {
        ...(prev as any)[section],
        [parent]: {
          ...((prev as any)[section]?.[parent] || {}),
          [field]: value,
        },
      },
    }));
  }, []);

  // Get water use type options based on template
  const waterUseOptions = useMemo(() => getWaterUseTypeOptions(template), [template]);
  const waterSourceOptions = useMemo(() => getWaterSourceTypeOptions(template), [template]);

  // Calculate totals for employment
  const employmentTotals = useMemo(() => {
    const emp = formData.section6_employment;
    const permanent = (parseInt(emp.permanentMale) || 0) + (parseInt(emp.permanentFemale) || 0);
    const temporary = (parseInt(emp.temporaryMale) || 0) + (parseInt(emp.temporaryFemale) || 0);
    const technical = (parseInt(emp.technicalMale) || 0) + (parseInt(emp.technicalFemale) || 0);
    const unskilled = (parseInt(emp.unskilledMale) || 0) + (parseInt(emp.unskilledFemale) || 0);
    const totalMale = (parseInt(emp.permanentMale) || 0) + (parseInt(emp.temporaryMale) || 0) + 
                      (parseInt(emp.technicalMale) || 0) + (parseInt(emp.unskilledMale) || 0);
    const totalFemale = (parseInt(emp.permanentFemale) || 0) + (parseInt(emp.temporaryFemale) || 0) + 
                        (parseInt(emp.technicalFemale) || 0) + (parseInt(emp.unskilledFemale) || 0);
    return { permanent, temporary, technical, unskilled, totalMale, totalFemale, total: totalMale + totalFemale };
  }, [formData.section6_employment]);

  // Calculate quarterly totals for abstraction
  const quarterlyTotal = useMemo(() => {
    const q = formData.section3_quarterly;
    return (parseFloat(q.q1?.volume) || 0) + (parseFloat(q.q2?.volume) || 0) + 
           (parseFloat(q.q3?.volume) || 0) + (parseFloat(q.q4?.volume) || 0);
  }, [formData.section3_quarterly]);

  // Handle save
  const handleSave = async () => {
    await onSaveAsDraft(formData);
  };

  // Handle submit
  const handleSubmitForm = async () => {
    await onSubmit(formData);
  };

  // Tab configuration based on template
  const tabs = [
    { id: 'section1', label: 'General Info', icon: User },
    { id: 'section2', label: 'Permitted Use', icon: Droplets },
    { id: 'section3', label: 'Actual Use', icon: BarChart3 },
    { id: 'section4', label: 'Efficiency', icon: Leaf },
    { id: 'section5', label: 'Environmental', icon: Leaf },
    { id: 'section6', label: 'Social/Gender', icon: Users },
    { id: 'section7', label: 'Compliance', icon: CheckSquare },
    { id: 'section8', label: 'Future Plans', icon: Calendar },
    { id: 'section9', label: 'Declaration', icon: FileSignature },
  ];

  return (
    <Card className="border-2 border-blue-200">
      <CardHeader className="bg-blue-50 border-b border-blue-200">
        <CardTitle className="flex items-center gap-2 text-blue-900">
          <BarChart3 className="h-5 w-5" />
          Annual Water Use Report - {reportingYear}
        </CardTitle>
        <CardDescription className="text-blue-700">
          Complete all 9 sections below. Click each tab to fill in the required information.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {/* Water Use Report Section Tabs - Made prominent */}
          <div className="mb-6 p-4 bg-slate-50 rounded-lg border">
            <p className="text-sm font-medium text-slate-700 mb-3">📋 Report Sections (click to navigate):</p>
            <TabsList className="flex flex-wrap gap-2 h-auto p-0 bg-transparent w-full">
              {tabs.map((tab, index) => (
                <TabsTrigger 
                  key={tab.id} 
                  value={tab.id}
                  className="text-sm px-4 py-2.5 border border-slate-300 bg-white hover:bg-slate-100 rounded-md flex items-center gap-2 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:border-blue-600"
                >
                  <span className="font-bold">{index + 1}.</span>
                  <tab.icon className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

        {/* SECTION 1: General Information (Read-only, prefilled from permit) */}
        <TabsContent value="section1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Section 1: General Information
              </CardTitle>
              <CardDescription>
                This information is automatically populated from your permit. It cannot be edited.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Name of Permit Holder</Label>
                  <div className="p-3 bg-slate-50 rounded-md border">
                    {permit.application?.project_title || 'N/A'}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Water Use Permit Number</Label>
                  <div className="p-3 bg-slate-50 rounded-md border font-mono">
                    {permit.permit_number}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Permit Issue Date</Label>
                  <div className="p-3 bg-slate-50 rounded-md border">
                    {formatDate(permit.issued_date)}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Permit Expiry Date</Label>
                  <div className="p-3 bg-slate-50 rounded-md border">
                    {formatDate(permit.expiry_date)}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Reporting Year</Label>
                  <div className="p-3 bg-blue-50 rounded-md border border-blue-200 font-semibold text-blue-800">
                    {reportingYear}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Type of Water Use</Label>
                  <div className="p-3 bg-slate-50 rounded-md border capitalize">
                    {permit.purpose?.replace(/_/g, ' ') || 'N/A'}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Water Source Type</Label>
                  <div className="p-3 bg-slate-50 rounded-md border capitalize">
                    {permit.water_source?.replace(/_/g, ' ') || 'N/A'}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Name of Water Body</Label>
                  <div className="p-3 bg-slate-50 rounded-md border">
                    {permit.application?.water_body_name || 'N/A'}
                  </div>
                </div>
              </div>

              {/* Administrative Location */}
              <div className="pt-4 border-t">
                <Label className="text-muted-foreground mb-3 block">Administrative Location</Label>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Province</span>
                    <div className="p-2 bg-slate-50 rounded-md border text-sm">
                      {permit.application?.province || 'N/A'}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">District</span>
                    <div className="p-2 bg-slate-50 rounded-md border text-sm">
                      {permit.application?.district || 'N/A'}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Sector</span>
                    <div className="p-2 bg-slate-50 rounded-md border text-sm">
                      {permit.application?.sector || 'N/A'}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Cell</span>
                    <div className="p-2 bg-slate-50 rounded-md border text-sm">
                      {permit.application?.cell || 'N/A'}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Village</span>
                    <div className="p-2 bg-slate-50 rounded-md border text-sm">
                      {permit.application?.village || 'N/A'}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SECTION 2: Permitted Water Use Summary */}
        <TabsContent value="section2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Droplets className="h-5 w-5" />
                Section 2: Permitted Water Use Summary
              </CardTitle>
              <CardDescription>
                Authorized values from your permit. These are read-only.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {template === 'abstraction' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Maximum Abstraction Rate (m³/day)</Label>
                    <div className="p-3 bg-slate-50 rounded-md border">
                      {permit.application?.max_daily_volume_m3 
                        ? `${permit.application.max_daily_volume_m3.toLocaleString()} m³/day`
                        : permit.water_allowance 
                          ? `${permit.water_allowance.toLocaleString()} ${permit.allowance_unit || 'm³'}`
                          : 'Not specified in permit'}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Authorized Annual Volume (m³/year)</Label>
                    <div className="p-3 bg-slate-50 rounded-md border">
                      {permit.application?.max_yearly_volume_m3 
                        ? `${permit.application.max_yearly_volume_m3.toLocaleString()} m³/year`
                        : permit.water_allowance && permit.allowance_unit?.includes('year')
                          ? `${permit.water_allowance.toLocaleString()} ${permit.allowance_unit}`
                          : 'Not specified in permit'}
                    </div>
                  </div>
                  {/* Show permit allowance if available as additional info */}
                  {permit.water_allowance && (
                    <div className="space-y-2 md:col-span-2">
                      <Label className="text-muted-foreground">Permit Water Allowance</Label>
                      <div className="p-3 bg-blue-50 rounded-md border border-blue-200">
                        {permit.water_allowance.toLocaleString()} {permit.allowance_unit || 'm³'}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Authorized Lake Surface Area (Ha)</Label>
                    <div className="p-3 bg-slate-50 rounded-md border">
                      {permit.application?.concession_area 
                        ? `${permit.application.concession_area.toLocaleString()} Ha`
                        : permit.water_allowance 
                          ? `${permit.water_allowance.toLocaleString()} ${permit.allowance_unit || 'Ha'}`
                          : 'Not specified in permit'}
                    </div>
                  </div>
                  {/* Show permit allowance if available */}
                  {permit.water_allowance && (
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">Permit Allowance</Label>
                      <div className="p-3 bg-blue-50 rounded-md border border-blue-200">
                        {permit.water_allowance.toLocaleString()} {permit.allowance_unit || 'Ha'}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SECTION 3: Actual Water Use During Reporting Year */}
        <TabsContent value="section3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Section 3: Actual Water Use During Reporting Year
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Operational Status */}
              <div className="space-y-3">
                <Label>Operational Status *</Label>
                <RadioGroup
                  value={formData.section3.operationalStatus}
                  onValueChange={(value) => updateFormData('section3', 'operationalStatus', value)}
                  disabled={isReadOnly}
                  className="flex gap-6"
                >
                  {template === 'abstraction' ? (
                    <>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="operational" id="operational" />
                        <Label htmlFor="operational">Operational</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="non_operational" id="non_operational" />
                        <Label htmlFor="non_operational">Non-operational</Label>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="fully" id="fully" />
                        <Label htmlFor="fully">Fully Operational</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="partial" id="partial" />
                        <Label htmlFor="partial">Partial</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="non_operational" id="non_operational" />
                        <Label htmlFor="non_operational">Non-Operational</Label>
                      </div>
                    </>
                  )}
                </RadioGroup>
              </div>

              {/* Concession-specific fields */}
              {template === 'concession' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="totalSurface">Total Surface Area Occupied (Ha)</Label>
                    <Input
                      id="totalSurface"
                      type="number"
                      step="0.01"
                      value={formData.section3.totalSurfaceAreaOccupied}
                      onChange={(e) => updateFormData('section3', 'totalSurfaceAreaOccupied', e.target.value)}
                      disabled={isReadOnly}
                      placeholder="Enter surface area in hectares"
                    />
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="changesYear"
                        checked={formData.section3.changesduringYear}
                        onCheckedChange={(checked) => updateFormData('section3', 'changesduringYear', checked)}
                        disabled={isReadOnly}
                      />
                      <Label htmlFor="changesYear">Changes During Reporting Year?</Label>
                    </div>
                    {formData.section3.changesduringYear && (
                      <Textarea
                        value={formData.section3.changesDescription}
                        onChange={(e) => updateFormData('section3', 'changesDescription', e.target.value)}
                        disabled={isReadOnly}
                        placeholder="Describe the changes..."
                        rows={3}
                      />
                    )}
                  </div>
                </>
              )}

              {/* Water Use Conflicts */}
              <div className="space-y-2">
                <Label htmlFor="conflicts">Water Use-Related Conflict or Challenges in the Area</Label>
                <Textarea
                  id="conflicts"
                  value={formData.section3.waterUseConflicts}
                  onChange={(e) => updateFormData('section3', 'waterUseConflicts', e.target.value)}
                  disabled={isReadOnly}
                  placeholder="Describe any conflicts or challenges..."
                  rows={3}
                />
              </div>

              {/* Payment Status */}
              <div className="space-y-3">
                <Label>Payment of Water Fees</Label>
                <RadioGroup
                  value={formData.section3.paymentStatus}
                  onValueChange={(value) => updateFormData('section3', 'paymentStatus', value)}
                  disabled={isReadOnly}
                  className="flex gap-6"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="paid" id="paid" />
                    <Label htmlFor="paid">Paid</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="not_paid" id="not_paid" />
                    <Label htmlFor="not_paid">Not Paid</Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Quarterly Data Table - Abstraction */}
              {template === 'abstraction' && (
                <div className="pt-4 border-t">
                  <h4 className="font-medium mb-4">Monthly/Quarterly Water Use Data</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Quarter</TableHead>
                        <TableHead>Volume Used (m³)</TableHead>
                        <TableHead>Avg Daily Use (m³/day)</TableHead>
                        <TableHead>Measurement Method</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {['q1', 'q2', 'q3', 'q4'].map((q, idx) => (
                        <TableRow key={q}>
                          <TableCell className="font-medium">Q{idx + 1}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              value={(formData.section3_quarterly as any)[q]?.volume || ''}
                              onChange={(e) => updateNestedFormData('section3_quarterly', q, 'volume', e.target.value)}
                              disabled={isReadOnly}
                              className="w-28"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              value={(formData.section3_quarterly as any)[q]?.avgDaily || ''}
                              onChange={(e) => updateNestedFormData('section3_quarterly', q, 'avgDaily', e.target.value)}
                              disabled={isReadOnly}
                              className="w-28"
                            />
                          </TableCell>
                          <TableCell>
                            <Select
                              value={(formData.section3_quarterly as any)[q]?.method || ''}
                              onValueChange={(value) => updateNestedFormData('section3_quarterly', q, 'method', value)}
                              disabled={isReadOnly}
                            >
                              <SelectTrigger className="w-36">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="meter">Meter Reading</SelectItem>
                                <SelectItem value="calculation">Calculation</SelectItem>
                                <SelectItem value="estimation">Estimation</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-slate-50">
                        <TableCell className="font-bold">Total</TableCell>
                        <TableCell className="font-bold">{quarterlyTotal.toFixed(2)} m³</TableCell>
                        <TableCell></TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Quarterly Data Table - Concession Fish Farming */}
              {template === 'concession' && permit.purpose?.includes('fish') && (
                <div className="pt-4 border-t">
                  <h4 className="font-medium mb-4">Quarterly Fish Farming Data</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Quarter</TableHead>
                        <TableHead>Number of Cages</TableHead>
                        <TableHead>Capacity (fish/cage)</TableHead>
                        <TableHead>Used Surface (Ha)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {['q1_fish', 'q2_fish', 'q3_fish', 'q4_fish'].map((q, idx) => (
                        <TableRow key={q}>
                          <TableCell className="font-medium">Q{idx + 1}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={(formData.section3_quarterly as any)[q]?.cages || ''}
                              onChange={(e) => updateNestedFormData('section3_quarterly', q, 'cages', e.target.value)}
                              disabled={isReadOnly}
                              className="w-24"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={(formData.section3_quarterly as any)[q]?.capacity || ''}
                              onChange={(e) => updateNestedFormData('section3_quarterly', q, 'capacity', e.target.value)}
                              disabled={isReadOnly}
                              className="w-24"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              value={(formData.section3_quarterly as any)[q]?.surface || ''}
                              onChange={(e) => updateNestedFormData('section3_quarterly', q, 'surface', e.target.value)}
                              disabled={isReadOnly}
                              className="w-24"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SECTION 4: Water Use Efficiency and Management */}
        <TabsContent value="section4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Leaf className="h-5 w-5" />
                Section 4: Water Use Efficiency and Management
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {template === 'abstraction' ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="efficiency">Water Efficiency Measures Implemented</Label>
                    <Textarea
                      id="efficiency"
                      value={formData.section4.efficiencyMeasures}
                      onChange={(e) => updateFormData('section4', 'efficiencyMeasures', e.target.value)}
                      disabled={isReadOnly}
                      placeholder="Describe water efficiency measures..."
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="recycling">Recycling / Reuse Practices</Label>
                    <Textarea
                      id="recycling"
                      value={formData.section4.recyclingPractices}
                      onChange={(e) => updateFormData('section4', 'recyclingPractices', e.target.value)}
                      disabled={isReadOnly}
                      placeholder="Describe recycling practices..."
                      rows={3}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="waterSaved">Estimated Water Saved (m³/year)</Label>
                      <Input
                        id="waterSaved"
                        type="number"
                        step="0.01"
                        value={formData.section4.estimatedWaterSaved}
                        onChange={(e) => updateFormData('section4', 'estimatedWaterSaved', e.target.value)}
                        disabled={isReadOnly}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reduction">Reduction Compared to Previous Year (%)</Label>
                      <Input
                        id="reduction"
                        type="number"
                        step="0.1"
                        value={formData.section4.reductionPercentage}
                        onChange={(e) => updateFormData('section4', 'reductionPercentage', e.target.value)}
                        disabled={isReadOnly}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="losses">Identified Losses (Leakage, Evaporation, etc.)</Label>
                    <Textarea
                      id="losses"
                      value={formData.section4.identifiedLosses}
                      onChange={(e) => updateFormData('section4', 'identifiedLosses', e.target.value)}
                      disabled={isReadOnly}
                      placeholder="Describe identified water losses..."
                      rows={3}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="prodOutput">Water Efficiency Measures - Production (Outputs)</Label>
                    <Textarea
                      id="prodOutput"
                      value={formData.section4.productionOutputMeasures}
                      onChange={(e) => updateFormData('section4', 'productionOutputMeasures', e.target.value)}
                      disabled={isReadOnly}
                      placeholder="Describe production efficiency measures..."
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ecological">Water Efficiency Measures - Ecological Impacts</Label>
                    <Textarea
                      id="ecological"
                      value={formData.section4.ecologicalImpactMeasures}
                      onChange={(e) => updateFormData('section4', 'ecologicalImpactMeasures', e.target.value)}
                      disabled={isReadOnly}
                      placeholder="Describe ecological impact measures..."
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="spatial">Water Efficiency Measures - Spatial Occupation</Label>
                    <Textarea
                      id="spatial"
                      value={formData.section4.spatialOccupationMeasures}
                      onChange={(e) => updateFormData('section4', 'spatialOccupationMeasures', e.target.value)}
                      disabled={isReadOnly}
                      placeholder="Describe spatial occupation measures..."
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reductionConc">Reduction Compared to Previous Year (%)</Label>
                    <Input
                      id="reductionConc"
                      type="number"
                      step="0.1"
                      value={formData.section4.reductionPercentage}
                      onChange={(e) => updateFormData('section4', 'reductionPercentage', e.target.value)}
                      disabled={isReadOnly}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SECTION 5: Environmental Compliance and Monitoring */}
        <TabsContent value="section5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Leaf className="h-5 w-5" />
                Section 5: Environmental Compliance and Monitoring
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Concession-specific: Infrastructure Nature & Pollution Prevention */}
              {template === 'concession' && (
                <>
                  <div className="space-y-3">
                    <Label>Nature/Property of Used Infrastructure/Equipment Offshore</Label>
                    <div className="flex flex-wrap gap-4">
                      {['Stainless steel', 'Wood', 'Galvanized', 'Plastic'].map((item) => (
                        <div key={item} className="flex items-center space-x-2">
                          <Checkbox
                            id={`infra-${item}`}
                            checked={formData.section5_monitoring.infrastructureNature?.includes(item)}
                            onCheckedChange={(checked) => {
                              const current = formData.section5_monitoring.infrastructureNature || [];
                              const updated = checked
                                ? [...current, item]
                                : current.filter((i: string) => i !== item);
                              updateFormData('section5_monitoring', 'infrastructureNature', updated);
                            }}
                            disabled={isReadOnly}
                          />
                          <Label htmlFor={`infra-${item}`}>{item}</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pollution">Pollution Prevention & Control Practices</Label>
                    <Textarea
                      id="pollution"
                      value={formData.section5_monitoring.pollutionPrevention}
                      onChange={(e) => updateFormData('section5_monitoring', 'pollutionPrevention', e.target.value)}
                      disabled={isReadOnly}
                      placeholder="Describe pollution prevention practices..."
                      rows={3}
                    />
                  </div>
                </>
              )}

              {/* Environmental Monitoring Results */}
              <div className="pt-4 border-t">
                <h4 className="font-medium mb-4">5.{template === 'concession' ? '2' : '1'} Environmental Monitoring Results</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Parameter</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead>Min</TableHead>
                      <TableHead>Max</TableHead>
                      <TableHead>Average</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>Water Temperature</TableCell>
                      <TableCell>°C</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.1"
                          value={formData.section5_monitoring.waterTemperature?.min || ''}
                          onChange={(e) => updateNestedFormData('section5_monitoring', 'waterTemperature', 'min', e.target.value)}
                          disabled={isReadOnly}
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.1"
                          value={formData.section5_monitoring.waterTemperature?.max || ''}
                          onChange={(e) => updateNestedFormData('section5_monitoring', 'waterTemperature', 'max', e.target.value)}
                          disabled={isReadOnly}
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.1"
                          value={formData.section5_monitoring.waterTemperature?.avg || ''}
                          onChange={(e) => updateNestedFormData('section5_monitoring', 'waterTemperature', 'avg', e.target.value)}
                          disabled={isReadOnly}
                          className="w-20"
                        />
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Dissolved Oxygen</TableCell>
                      <TableCell>mg/L</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={formData.section5_monitoring.dissolvedOxygen?.min || ''}
                          onChange={(e) => updateNestedFormData('section5_monitoring', 'dissolvedOxygen', 'min', e.target.value)}
                          disabled={isReadOnly}
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={formData.section5_monitoring.dissolvedOxygen?.max || ''}
                          onChange={(e) => updateNestedFormData('section5_monitoring', 'dissolvedOxygen', 'max', e.target.value)}
                          disabled={isReadOnly}
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={formData.section5_monitoring.dissolvedOxygen?.avg || ''}
                          onChange={(e) => updateNestedFormData('section5_monitoring', 'dissolvedOxygen', 'avg', e.target.value)}
                          disabled={isReadOnly}
                          className="w-20"
                        />
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Turbidity</TableCell>
                      <TableCell>NTU</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.1"
                          value={formData.section5_monitoring.turbidity?.min || ''}
                          onChange={(e) => updateNestedFormData('section5_monitoring', 'turbidity', 'min', e.target.value)}
                          disabled={isReadOnly}
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.1"
                          value={formData.section5_monitoring.turbidity?.max || ''}
                          onChange={(e) => updateNestedFormData('section5_monitoring', 'turbidity', 'max', e.target.value)}
                          disabled={isReadOnly}
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.1"
                          value={formData.section5_monitoring.turbidity?.avg || ''}
                          onChange={(e) => updateNestedFormData('section5_monitoring', 'turbidity', 'avg', e.target.value)}
                          disabled={isReadOnly}
                          className="w-20"
                        />
                      </TableCell>
                    </TableRow>
                    {template === 'concession' && (
                      <>
                        <TableRow>
                          <TableCell>pH</TableCell>
                          <TableCell>-</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.1"
                              value={formData.section5_monitoring.ph?.min || ''}
                              onChange={(e) => updateNestedFormData('section5_monitoring', 'ph', 'min', e.target.value)}
                              disabled={isReadOnly}
                              className="w-20"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.1"
                              value={formData.section5_monitoring.ph?.max || ''}
                              onChange={(e) => updateNestedFormData('section5_monitoring', 'ph', 'max', e.target.value)}
                              disabled={isReadOnly}
                              className="w-20"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.1"
                              value={formData.section5_monitoring.ph?.avg || ''}
                              onChange={(e) => updateNestedFormData('section5_monitoring', 'ph', 'avg', e.target.value)}
                              disabled={isReadOnly}
                              className="w-20"
                            />
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Nutrients (P & N)</TableCell>
                          <TableCell>mg/L</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              value={formData.section5_monitoring.nutrients?.min || ''}
                              onChange={(e) => updateNestedFormData('section5_monitoring', 'nutrients', 'min', e.target.value)}
                              disabled={isReadOnly}
                              className="w-20"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              value={formData.section5_monitoring.nutrients?.max || ''}
                              onChange={(e) => updateNestedFormData('section5_monitoring', 'nutrients', 'max', e.target.value)}
                              disabled={isReadOnly}
                              className="w-20"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              value={formData.section5_monitoring.nutrients?.avg || ''}
                              onChange={(e) => updateNestedFormData('section5_monitoring', 'nutrients', 'avg', e.target.value)}
                              disabled={isReadOnly}
                              className="w-20"
                            />
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>BOD</TableCell>
                          <TableCell>mg/L</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              value={formData.section5_monitoring.bod?.min || ''}
                              onChange={(e) => updateNestedFormData('section5_monitoring', 'bod', 'min', e.target.value)}
                              disabled={isReadOnly}
                              className="w-20"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              value={formData.section5_monitoring.bod?.max || ''}
                              onChange={(e) => updateNestedFormData('section5_monitoring', 'bod', 'max', e.target.value)}
                              disabled={isReadOnly}
                              className="w-20"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              value={formData.section5_monitoring.bod?.avg || ''}
                              onChange={(e) => updateNestedFormData('section5_monitoring', 'bod', 'avg', e.target.value)}
                              disabled={isReadOnly}
                              className="w-20"
                            />
                          </TableCell>
                        </TableRow>
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Environmental Incidents */}
              <div className="pt-4 border-t">
                <h4 className="font-medium mb-4">5.{template === 'concession' ? '3' : '2'} Environmental Incidents</h4>
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="hasIncidents"
                      checked={formData.section5_incidents.hasIncidents}
                      onCheckedChange={(checked) => updateFormData('section5_incidents', 'hasIncidents', checked)}
                      disabled={isReadOnly}
                    />
                    <Label htmlFor="hasIncidents">Any pollution, spills, or accidents?</Label>
                  </div>
                  {formData.section5_incidents.hasIncidents && (
                    <div className="space-y-4 pl-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="incidentDate">Date of Incident</Label>
                          <Input
                            id="incidentDate"
                            type="date"
                            value={formData.section5_incidents.incidentDate}
                            onChange={(e) => updateFormData('section5_incidents', 'incidentDate', e.target.value)}
                            disabled={isReadOnly}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="reportedDate">Date Reported to Authority</Label>
                          <Input
                            id="reportedDate"
                            type="date"
                            value={formData.section5_incidents.dateReportedToAuthority}
                            onChange={(e) => updateFormData('section5_incidents', 'dateReportedToAuthority', e.target.value)}
                            disabled={isReadOnly}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="incidentDesc">Description</Label>
                        <Textarea
                          id="incidentDesc"
                          value={formData.section5_incidents.incidentDescription}
                          onChange={(e) => updateFormData('section5_incidents', 'incidentDescription', e.target.value)}
                          disabled={isReadOnly}
                          rows={3}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="corrective">Corrective Actions Taken</Label>
                        <Textarea
                          id="corrective"
                          value={formData.section5_incidents.correctiveActions}
                          onChange={(e) => updateFormData('section5_incidents', 'correctiveActions', e.target.value)}
                          disabled={isReadOnly}
                          rows={3}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SECTION 6: Social and Gender-Disaggregated Information */}
        <TabsContent value="section6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Section 6: Social and Gender-Disaggregated Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Employment Table */}
              <div>
                <h4 className="font-medium mb-4">6.1 Employment Related to Water Use Activity</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead>Male</TableHead>
                      <TableHead>Female</TableHead>
                      <TableHead>Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>Permanent Employees</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={formData.section6_employment.permanentMale}
                          onChange={(e) => updateFormData('section6_employment', 'permanentMale', e.target.value)}
                          disabled={isReadOnly}
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={formData.section6_employment.permanentFemale}
                          onChange={(e) => updateFormData('section6_employment', 'permanentFemale', e.target.value)}
                          disabled={isReadOnly}
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell className="font-medium">{employmentTotals.permanent}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Temporary / Seasonal Workers</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={formData.section6_employment.temporaryMale}
                          onChange={(e) => updateFormData('section6_employment', 'temporaryMale', e.target.value)}
                          disabled={isReadOnly}
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={formData.section6_employment.temporaryFemale}
                          onChange={(e) => updateFormData('section6_employment', 'temporaryFemale', e.target.value)}
                          disabled={isReadOnly}
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell className="font-medium">{employmentTotals.temporary}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Technical / Skilled Staff</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={formData.section6_employment.technicalMale}
                          onChange={(e) => updateFormData('section6_employment', 'technicalMale', e.target.value)}
                          disabled={isReadOnly}
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={formData.section6_employment.technicalFemale}
                          onChange={(e) => updateFormData('section6_employment', 'technicalFemale', e.target.value)}
                          disabled={isReadOnly}
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell className="font-medium">{employmentTotals.technical}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Unskilled / Support Staff</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={formData.section6_employment.unskilledMale}
                          onChange={(e) => updateFormData('section6_employment', 'unskilledMale', e.target.value)}
                          disabled={isReadOnly}
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={formData.section6_employment.unskilledFemale}
                          onChange={(e) => updateFormData('section6_employment', 'unskilledFemale', e.target.value)}
                          disabled={isReadOnly}
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell className="font-medium">{employmentTotals.unskilled}</TableCell>
                    </TableRow>
                    <TableRow className="bg-slate-50 font-bold">
                      <TableCell>Total Workforce</TableCell>
                      <TableCell>{employmentTotals.totalMale}</TableCell>
                      <TableCell>{employmentTotals.totalFemale}</TableCell>
                      <TableCell>{employmentTotals.total}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {/* Concession-specific: Community Engagement */}
              {template === 'concession' && (
                <div className="pt-4 border-t">
                  <h4 className="font-medium mb-4">6.2 Community Engagement and Benefits</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="communityEngaged">Local Community Members Engaged</Label>
                      <Input
                        id="communityEngaged"
                        value={formData.section6_employment.communityEngaged}
                        onChange={(e) => updateFormData('section6_employment', 'communityEngaged', e.target.value)}
                        disabled={isReadOnly}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="womenConsult">Women Participating in Consultations (Number / %)</Label>
                      <Input
                        id="womenConsult"
                        value={formData.section6_employment.womenInConsultations}
                        onChange={(e) => updateFormData('section6_employment', 'womenInConsultations', e.target.value)}
                        disabled={isReadOnly}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div className="space-y-2">
                      <Label htmlFor="communityBenefits">Community Benefits Linked to Water Use</Label>
                      <Textarea
                        id="communityBenefits"
                        value={formData.section6_employment.communityBenefits}
                        onChange={(e) => updateFormData('section6_employment', 'communityBenefits', e.target.value)}
                        disabled={isReadOnly}
                        rows={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="genderSupport">Gender-Specific Support Measures</Label>
                      <Textarea
                        id="genderSupport"
                        value={formData.section6_employment.genderSupportMeasures}
                        onChange={(e) => updateFormData('section6_employment', 'genderSupportMeasures', e.target.value)}
                        disabled={isReadOnly}
                        rows={2}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* OHS */}
              <div className="pt-4 border-t">
                <h4 className="font-medium mb-4">6.{template === 'concession' ? '3' : '2'} Occupational Health and Safety (Gender-Sensitive)</h4>
                <div className="space-y-4">
                  <div className="flex items-start space-x-4">
                    <div className="flex items-center space-x-2 min-w-[250px]">
                      <Checkbox
                        id="genderSafety"
                        checked={formData.section6_ohs.genderInclusiveSafety}
                        onCheckedChange={(checked) => updateFormData('section6_ohs', 'genderInclusiveSafety', checked)}
                        disabled={isReadOnly}
                      />
                      <Label htmlFor="genderSafety">Gender-inclusive safety measures in place</Label>
                    </div>
                    <Input
                      placeholder="Remarks"
                      value={formData.section6_ohs.genderInclusiveSafetyRemarks}
                      onChange={(e) => updateFormData('section6_ohs', 'genderInclusiveSafetyRemarks', e.target.value)}
                      disabled={isReadOnly}
                      className="flex-1"
                    />
                  </div>
                  <div className="flex items-start space-x-4">
                    <div className="flex items-center space-x-2 min-w-[250px]">
                      <Checkbox
                        id="sanitation"
                        checked={formData.section6_ohs.separateSanitation}
                        onCheckedChange={(checked) => updateFormData('section6_ohs', 'separateSanitation', checked)}
                        disabled={isReadOnly}
                      />
                      <Label htmlFor="sanitation">Separate sanitation facilities</Label>
                    </div>
                    <Input
                      placeholder="Remarks"
                      value={formData.section6_ohs.separateSanitationRemarks}
                      onChange={(e) => updateFormData('section6_ohs', 'separateSanitationRemarks', e.target.value)}
                      disabled={isReadOnly}
                      className="flex-1"
                    />
                  </div>
                  <div className="flex items-start space-x-4">
                    <div className="flex items-center space-x-2 min-w-[250px]">
                      <Checkbox
                        id="grievance"
                        checked={formData.section6_ohs.genderGrievance}
                        onCheckedChange={(checked) => updateFormData('section6_ohs', 'genderGrievance', checked)}
                        disabled={isReadOnly}
                      />
                      <Label htmlFor="grievance">Gender-responsive grievance mechanism</Label>
                    </div>
                    <Input
                      placeholder="Remarks"
                      value={formData.section6_ohs.genderGrievanceRemarks}
                      onChange={(e) => updateFormData('section6_ohs', 'genderGrievanceRemarks', e.target.value)}
                      disabled={isReadOnly}
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SECTION 7: Compliance Status */}
        <TabsContent value="section7">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckSquare className="h-5 w-5" />
                Section 7: Compliance Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start space-x-4">
                  <div className="flex items-center space-x-2 min-w-[250px]">
                    <Checkbox
                      id="permitLimits"
                      checked={formData.section7.permitLimitsCompliance}
                      onCheckedChange={(checked) => updateFormData('section7', 'permitLimitsCompliance', checked)}
                      disabled={isReadOnly}
                    />
                    <Label htmlFor="permitLimits">Compliance with permit limits</Label>
                  </div>
                  <Input
                    placeholder="Remarks"
                    value={formData.section7.permitLimitsRemarks}
                    onChange={(e) => updateFormData('section7', 'permitLimitsRemarks', e.target.value)}
                    disabled={isReadOnly}
                    className="flex-1"
                  />
                </div>

                {template === 'concession' && (
                  <div className="flex items-start space-x-4">
                    <div className="flex items-center space-x-2 min-w-[250px]">
                      <Checkbox
                        id="zoning"
                        checked={formData.section7.zoningCompliance}
                        onCheckedChange={(checked) => updateFormData('section7', 'zoningCompliance', checked)}
                        disabled={isReadOnly}
                      />
                      <Label htmlFor="zoning">Compliance with zoning restrictions</Label>
                    </div>
                    <Input
                      placeholder="Remarks"
                      value={formData.section7.zoningRemarks}
                      onChange={(e) => updateFormData('section7', 'zoningRemarks', e.target.value)}
                      disabled={isReadOnly}
                      className="flex-1"
                    />
                  </div>
                )}

                <div className="flex items-start space-x-4">
                  <div className="flex items-center space-x-2 min-w-[250px]">
                    <Checkbox
                      id="envApproval"
                      checked={formData.section7.environmentalApprovalCompliance}
                      onCheckedChange={(checked) => updateFormData('section7', 'environmentalApprovalCompliance', checked)}
                      disabled={isReadOnly}
                    />
                    <Label htmlFor="envApproval">Environmental approval compliance</Label>
                  </div>
                  <Input
                    placeholder="Remarks"
                    value={formData.section7.environmentalApprovalRemarks}
                    onChange={(e) => updateFormData('section7', 'environmentalApprovalRemarks', e.target.value)}
                    disabled={isReadOnly}
                    className="flex-1"
                  />
                </div>

                <div className="flex items-start space-x-4">
                  <div className="flex items-center space-x-2 min-w-[250px]">
                    <Checkbox
                      id="monitoring"
                      checked={formData.section7.monitoringReportsCompliance}
                      onCheckedChange={(checked) => updateFormData('section7', 'monitoringReportsCompliance', checked)}
                      disabled={isReadOnly}
                    />
                    <Label htmlFor="monitoring">Submission of monitoring reports</Label>
                  </div>
                  <Input
                    placeholder="Remarks"
                    value={formData.section7.monitoringReportsRemarks}
                    onChange={(e) => updateFormData('section7', 'monitoringReportsRemarks', e.target.value)}
                    disabled={isReadOnly}
                    className="flex-1"
                  />
                </div>

                <div className="flex items-start space-x-4">
                  <div className="flex items-center space-x-2 min-w-[250px]">
                    <Checkbox
                      id="fees"
                      checked={formData.section7.waterFeesCompliance}
                      onCheckedChange={(checked) => updateFormData('section7', 'waterFeesCompliance', checked)}
                      disabled={isReadOnly}
                    />
                    <Label htmlFor="fees">Payment of water use fees</Label>
                  </div>
                  <Input
                    placeholder="Remarks"
                    value={formData.section7.waterFeesRemarks}
                    onChange={(e) => updateFormData('section7', 'waterFeesRemarks', e.target.value)}
                    disabled={isReadOnly}
                    className="flex-1"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SECTION 8: Future Plans */}
        <TabsContent value="section8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Section 8: Future Plans (Next Reporting Year)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="plannedChanges">Planned Changes in Water Use</Label>
                <Textarea
                  id="plannedChanges"
                  value={formData.section8.plannedChanges}
                  onChange={(e) => updateFormData('section8', 'plannedChanges', e.target.value)}
                  disabled={isReadOnly}
                  placeholder="Describe any planned changes..."
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expectedChange">Expected Increase/Decrease (%)</Label>
                <Input
                  id="expectedChange"
                  type="number"
                  step="0.1"
                  value={formData.section8.expectedChangePercentage}
                  onChange={(e) => updateFormData('section8', 'expectedChangePercentage', e.target.value)}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="infrastructure">Planned Infrastructure Upgrades</Label>
                <Textarea
                  id="infrastructure"
                  value={formData.section8.plannedInfrastructureUpgrades}
                  onChange={(e) => updateFormData('section8', 'plannedInfrastructureUpgrades', e.target.value)}
                  disabled={isReadOnly}
                  placeholder="Describe planned upgrades..."
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="envImprove">Environmental Improvement Measures</Label>
                <Textarea
                  id="envImprove"
                  value={formData.section8.environmentalImprovements}
                  onChange={(e) => updateFormData('section8', 'environmentalImprovements', e.target.value)}
                  disabled={isReadOnly}
                  placeholder="Describe environmental improvements..."
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="genderActions">Planned Actions to Enhance Gender Inclusion</Label>
                <Textarea
                  id="genderActions"
                  value={formData.section8.genderInclusionActions}
                  onChange={(e) => updateFormData('section8', 'genderInclusionActions', e.target.value)}
                  disabled={isReadOnly}
                  placeholder="Describe gender inclusion plans..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SECTION 9: Declaration */}
        <TabsContent value="section9">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSignature className="h-5 w-5" />
                Section 9: Declaration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-800">
                  I hereby certify that the information provided in this report is true, accurate, 
                  complete, and complies with the conditions of the Water Use Permit.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="declarantName">Full Name *</Label>
                  <Input
                    id="declarantName"
                    value={formData.section9_declaration.declarantName}
                    onChange={(e) => updateFormData('section9_declaration', 'declarantName', e.target.value)}
                    disabled={isReadOnly}
                    placeholder="Enter your full name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="declarationDate">Date *</Label>
                  <Input
                    id="declarationDate"
                    type="date"
                    value={formData.section9_declaration.declarationDate}
                    onChange={(e) => updateFormData('section9_declaration', 'declarationDate', e.target.value)}
                    disabled={isReadOnly}
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2 p-4 border rounded-lg">
                <Checkbox
                  id="agreed"
                  checked={formData.section9_declaration.agreed}
                  onCheckedChange={(checked) => updateFormData('section9_declaration', 'agreed', checked)}
                  disabled={isReadOnly}
                />
                <Label htmlFor="agreed" className="text-sm">
                  I confirm that all information provided is accurate and I agree to the declaration above.
                </Label>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      {!isReadOnly && (
        <div className="flex justify-between items-center pt-6 border-t">
          <Button
            variant="outline"
            onClick={handleSave}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save as Draft
          </Button>
          <Button
            onClick={handleSubmitForm}
            disabled={isLoading || !formData.section9_declaration.agreed || !formData.section9_declaration.declarantName}
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Submit Report
          </Button>
        </div>
      )}

        {/* Read-only message */}
        {isReadOnly && (
          <div className="flex items-center justify-center p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <Info className="h-5 w-5 text-amber-600 mr-2" />
            <span className="text-amber-800">This report has been submitted and cannot be edited.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
