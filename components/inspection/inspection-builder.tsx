"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { 
  FileCheck, 
  Save, 
  Send, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  FileText,
  MapPin,
  Droplets,
  Calendar,
  Info
} from "lucide-react"
import { getApplicationById } from "@/lib/supabase"

const inspectionFormSchema = z.object({
  // General Information
  applicationId: z.string().min(1, "Application ID is required"),
  inspectionDate: z.string().min(1, "Inspection date is required"),
  inspectorName: z.string().min(1, "Inspector name is required"),
  inspectionType: z.enum(["initial", "follow_up", "annual", "complaint"]),
  
  // Location Verification
  locationVerification: z.object({
    matches: z.enum(["yes", "no", "partial"]),
    actualCoordinates: z.string().optional(),
    sitePlan: z.boolean().optional(),
    sectionComments: z.string().optional(),
  }),
  
  // Technical Verification
  technicalVerification: z.object({
    waterSourceVerified: z.enum(["yes", "no", "partial"]),
    extractionMethodVerified: z.enum(["yes", "no", "partial"]),
    flowMeasurementVerified: z.enum(["yes", "no", "partial"]),
    infrastructureCondition: z.enum(["good", "fair", "poor"]),
    installationCompliance: z.enum(["yes", "no", "partial"]),
    sectionComments: z.string().optional(),
  }),
  
  // Environmental Compliance
  environmentalCompliance: z.object({
    impactAssessment: z.enum(["minimal", "moderate", "significant"]),
    mitigationMeasures: z.enum(["yes", "no", "partial"]),
    wasteManagement: z.enum(["yes", "no", "partial"]),
    vegetationImpact: z.enum(["minimal", "moderate", "significant"]),
    sectionComments: z.string().optional(),
  }),
  
  // Regulatory Compliance
  regulatoryCompliance: z.object({
    permitConditions: z.enum(["met", "not_met", "partially_met"]),
    volumeLimits: z.enum(["compliant", "non_compliant", "unknown"]),
    reportingRequirements: z.enum(["met", "not_met", "overdue"]),
    feesUpToDate: z.enum(["yes", "no", "partial"]),
    sectionComments: z.string().optional(),
  }),
  
  // Evidence Collection
  evidenceCollection: z.object({
    attachments: z.array(z.object({
      id: z.string(),
      name: z.string(),
      type: z.string(),
      size: z.number(),
      url: z.string().optional(),
    })).optional(),
    samplesCollected: z.boolean().optional(),
    sampleTypes: z.string().optional(),
    gpsCoordinates: z.string().optional(),
    sectionComments: z.string().optional(),
  }),
})

type InspectionFormValues = z.infer<typeof inspectionFormSchema>

// Default values
const defaultValues: Partial<InspectionFormValues> = {
  inspectionDate: new Date().toISOString().split('T')[0],
  inspectorName: "Current Inspector",
  inspectionType: "initial",
  locationVerification: {
    matches: "yes",
    sitePlan: false,
  },
  technicalVerification: {
    waterSourceVerified: "yes",
    extractionMethodVerified: "yes",
    flowMeasurementVerified: "yes",
    infrastructureCondition: "good",
    installationCompliance: "yes",
  },
  environmentalCompliance: {
    impactAssessment: "minimal",
    mitigationMeasures: "yes",
    wasteManagement: "yes",
    vegetationImpact: "minimal",
  },
  regulatoryCompliance: {
    permitConditions: "met",
    volumeLimits: "compliant",
    reportingRequirements: "met",
    feesUpToDate: "yes",
  },
  evidenceCollection: {
    attachments: [],
    samplesCollected: false,
  },
}

export function InspectionBuilder() {
  const searchParams = useSearchParams()
  const applicationId = searchParams.get("applicationId")
  const [activeTab, setActiveTab] = useState("general")
  const [progress, setProgress] = useState(0)
  const [applicationData, setApplicationData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const form = useForm<InspectionFormValues>({
    resolver: zodResolver(inspectionFormSchema),
    defaultValues,
  })

  // Fetch application data
  useEffect(() => {
    const fetchApplication = async () => {
      if (applicationId) {
        try {
          const app = await getApplicationById(applicationId)
          setApplicationData(app)
        } catch (error) {
          console.error('Error fetching application:', error)
        } finally {
          setLoading(false)
        }
      }
    }
    fetchApplication()
  }, [applicationId])

  const { watch } = form

  // Calculate progress based on filled required fields
  useEffect(() => {
    const subscription = watch((value) => {
      let completedSections = 0
      const totalSections = 6 // general, location, technical, environmental, regulatory, evidence
      
      // Check if general section is complete
      if (value.applicationId && value.inspectionDate && value.inspectorName && value.inspectionType) {
        completedSections++
      }
      
      // Check if location verification is complete
      if (value.locationVerification?.matches) {
        completedSections++
      }
      
      // Check if technical verification is complete
      if (value.technicalVerification?.waterSourceVerified && 
          value.technicalVerification?.extractionMethodVerified &&
          value.technicalVerification?.infrastructureCondition) {
        completedSections++
      }
      
      // Check if environmental compliance is complete
      if (value.environmentalCompliance?.impactAssessment && 
          value.environmentalCompliance?.mitigationMeasures) {
        completedSections++
      }
      
      // Check if regulatory compliance is complete
      if (value.regulatoryCompliance?.permitConditions && 
          value.regulatoryCompliance?.volumeLimits) {
        completedSections++
      }
      
      // Check if evidence collection is complete
      if (value.evidenceCollection?.attachments !== undefined || value.evidenceCollection?.samplesCollected !== undefined) {
        completedSections++
      }
      
      const newProgress = Math.round((completedSections / totalSections) * 100)
      setProgress(newProgress)
    })
    
    return () => subscription.unsubscribe()
  }, [watch])

  useEffect(() => {
    if (applicationId) {
      form.setValue("applicationId", applicationId)
    }
  }, [applicationId, form])

  function onSubmit(data: InspectionFormValues) {
    console.log("Inspection Data:", data)
    // Handle form submission
  }

  // Show loading state while fetching application data
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <span>Loading application data...</span>
        </div>
      </div>
    )
  }

  const VerificationField = ({ 
    name, 
    label, 
    applicationValue,
    applicationSectionTitle,
    description 
  }: { 
    name: string
    label: string
    applicationValue: string | number | React.ReactNode
    applicationSectionTitle: string
    description?: string
  }) => (
    <Card className="bg-gradient-to-b from-slate-50 to-white dark:from-slate-900/50 dark:to-slate-900/20 border-slate-200 dark:border-slate-800">
      {/* Application Information Section */}
      <CardHeader className="pb-3 bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-700 rounded-t-lg">
        <CardTitle className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <FileText className="h-4 w-4" />
          {applicationSectionTitle}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-3 pb-4">
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700">
          {applicationValue || "Not specified"}
        </div>
        
        {/* Inspector Verification Section */}
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Inspector Verification</span>
          </div>
          
          <FormField
            control={form.control}
            name={name as any}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-base font-medium text-slate-900 dark:text-slate-100">{label}</FormLabel>
                {description && <FormDescription className="text-slate-600 dark:text-slate-400">{description}</FormDescription>}
                <FormControl>
                  <RadioGroup
                    onValueChange={field.onChange}
                    value={field.value}
                    className="flex flex-col space-y-3 mt-3"
                  >
                    <div className="flex items-center space-x-3 p-2 rounded-md hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors">
                      <RadioGroupItem value="yes" id={`${name}-yes`} />
                      <label htmlFor={`${name}-yes`} className="flex items-center text-sm font-medium cursor-pointer">
                        <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
                        Matches/Verified
                      </label>
                    </div>
                    <div className="flex items-center space-x-3 p-2 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                      <RadioGroupItem value="no" id={`${name}-no`} />
                      <label htmlFor={`${name}-no`} className="flex items-center text-sm font-medium cursor-pointer">
                        <XCircle className="h-4 w-4 mr-2 text-red-600" />
                        Doesn't Match
                      </label>
                    </div>
                    <div className="flex items-center space-x-3 p-2 rounded-md hover:bg-yellow-50 dark:hover:bg-yellow-900/20 transition-colors">
                      <RadioGroupItem value="partial" id={`${name}-partial`} />
                      <label htmlFor={`${name}-partial`} className="flex items-center text-sm font-medium cursor-pointer">
                        <AlertTriangle className="h-4 w-4 mr-2 text-yellow-600" />
                        Partial/Needs Review
                      </label>
                    </div>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </CardContent>
    </Card>
  )



  const SectionComments = ({ 
    name, 
    label = "Section Comments"
  }: { 
    name: string
    label?: string
  }) => (
    <Card className="bg-gradient-to-b from-amber-50 to-white dark:from-amber-900/20 dark:to-slate-900/20 border-amber-200 dark:border-amber-800">
      <CardHeader className="pb-3 bg-gradient-to-r from-amber-100 to-amber-50 dark:from-amber-800 dark:to-amber-700 rounded-t-lg">
        <CardTitle className="text-sm font-medium text-amber-700 dark:text-amber-300 flex items-center gap-2">
          <FileText className="h-4 w-4" />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-3">
        <FormField
          control={form.control}
          name={name as any}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-base font-medium text-slate-900 dark:text-slate-100">Additional Comments & Observations</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Add any relevant comments, observations, or additional notes for this section..."
                  {...field}
                  rows={4}
                  className="mt-2 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus:border-amber-500 focus:ring-amber-500"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </CardContent>
    </Card>
  )

  const AssessmentField = ({ 
    name, 
    label, 
    options,
    description 
  }: { 
    name: string
    label: string
    options: Array<{ value: string; label: string; icon?: React.ReactNode; color?: string }>
    description?: string
  }) => (
    <Card className="bg-gradient-to-b from-indigo-50 to-white dark:from-indigo-900/20 dark:to-slate-900/20 border-indigo-200 dark:border-indigo-800">
      <CardHeader className="pb-3 bg-gradient-to-r from-indigo-100 to-indigo-50 dark:from-indigo-800 dark:to-indigo-700 rounded-t-lg">
        <CardTitle className="text-sm font-medium text-indigo-700 dark:text-indigo-300 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          Inspector Assessment
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-3">
        <FormField
          control={form.control}
          name={name as any}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-base font-medium text-slate-900 dark:text-slate-100">{label}</FormLabel>
              {description && <FormDescription className="text-slate-600 dark:text-slate-400">{description}</FormDescription>}
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  value={field.value}
                  className="flex flex-col space-y-3 mt-3"
                >
                  {options.map((option) => (
                    <div key={option.value} className={`flex items-center space-x-3 p-2 rounded-md hover:bg-${option.color || 'slate'}-50 dark:hover:bg-${option.color || 'slate'}-900/20 transition-colors`}>
                      <RadioGroupItem value={option.value} id={`${name}-${option.value}`} />
                      <label htmlFor={`${name}-${option.value}`} className="flex items-center text-sm font-medium cursor-pointer">
                        {option.icon && <span className="mr-2">{option.icon}</span>}
                        {option.label}
                      </label>
                    </div>
                  ))}
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-6">
      {/* Progress Header */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileCheck className="h-5 w-5" />
                Inspection Report
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Application ID: {applicationId || "N/A"}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-sm font-medium">Progress</div>
                <div className="text-2xl font-bold">{progress}%</div>
              </div>
              <Progress value={progress} className="w-24" />
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Application Overview */}
      {applicationData && (
        <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-200 dark:border-blue-800">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-blue-900 dark:text-blue-100 flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Application Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1">
                <div className="text-sm font-medium text-blue-700 dark:text-blue-300">Application Number</div>
                <div className="text-sm text-blue-900 dark:text-blue-100">{applicationData.application_number}</div>
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium text-blue-700 dark:text-blue-300">Project Title</div>
                <div className="text-sm text-blue-900 dark:text-blue-100">{applicationData.project_title}</div>
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium text-blue-700 dark:text-blue-300">Applicant</div>
                <div className="text-sm text-blue-900 dark:text-blue-100">
                  {applicationData.applicant?.company_name || 
                   `${applicationData.applicant?.first_name} ${applicationData.applicant?.last_name}`}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium text-blue-700 dark:text-blue-300">Water Purpose</div>
                <div className="text-sm text-blue-900 dark:text-blue-100">
                  {applicationData.water_purpose?.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium text-blue-700 dark:text-blue-300">Usage Volume</div>
                <div className="text-sm text-blue-900 dark:text-blue-100">
                  {applicationData.estimated_usage_volume} {applicationData.usage_unit}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium text-blue-700 dark:text-blue-300">Status</div>
                <Badge variant="secondary" className="text-blue-900 dark:text-blue-100">
                  {applicationData.status?.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Form */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardContent className="pt-6">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-6">
                  <TabsTrigger value="general">General</TabsTrigger>
                  <TabsTrigger value="location">Location</TabsTrigger>
                  <TabsTrigger value="technical">Technical</TabsTrigger>
                  <TabsTrigger value="environmental">Environmental</TabsTrigger>
                  <TabsTrigger value="regulatory">Regulatory</TabsTrigger>
                  <TabsTrigger value="evidence">Evidence</TabsTrigger>
                </TabsList>

                {/* General Information Tab */}
                <TabsContent value="general" className="space-y-6">
                  {/* Applicant Information Card */}
                  {applicationData && (
                    <Card className="bg-gradient-to-b from-green-50 to-white dark:from-green-900/20 dark:to-slate-900/20 border-green-200 dark:border-green-800">
                      <CardHeader className="pb-3 bg-gradient-to-r from-green-100 to-green-50 dark:from-green-800 dark:to-green-700 rounded-t-lg">
                        <CardTitle className="text-sm font-medium text-green-700 dark:text-green-300 flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Applicant Information
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <div className="text-sm font-medium text-green-700 dark:text-green-300">Name</div>
                            <div className="text-sm text-green-900 dark:text-green-100 font-medium">
                              {applicationData.applicant?.company_name || 
                               `${applicationData.applicant?.first_name} ${applicationData.applicant?.last_name}`}
                            </div>
                          </div>
                          {applicationData.applicant?.company_name && (
                            <div className="space-y-1">
                              <div className="text-sm font-medium text-green-700 dark:text-green-300">Contact Person</div>
                              <div className="text-sm text-green-900 dark:text-green-100">
                                {applicationData.applicant?.first_name} {applicationData.applicant?.last_name}
                              </div>
                            </div>
                          )}
                          <div className="space-y-1">
                            <div className="text-sm font-medium text-green-700 dark:text-green-300">Email</div>
                            <div className="text-sm text-green-900 dark:text-green-100">
                              {applicationData.applicant?.email || 'Not provided'}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-sm font-medium text-green-700 dark:text-green-300">Phone</div>
                            <div className="text-sm text-green-900 dark:text-green-100">
                              {applicationData.applicant?.phone || 'Not provided'}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Inspection Details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="applicationId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Application ID</FormLabel>
                          <FormControl>
                            <Input {...field} readOnly />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="inspectionDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Inspection Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="inspectorName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Inspector Name</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Current Inspector" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="inspectionType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Inspection Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select inspection type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="initial">Initial Inspection</SelectItem>
                              <SelectItem value="follow_up">Follow-up Inspection</SelectItem>
                              <SelectItem value="annual">Annual Inspection</SelectItem>
                              <SelectItem value="complaint">Complaint Investigation</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </TabsContent>

                {/* Location Verification Tab */}
                <TabsContent value="location" className="space-y-6">
                  <div className="space-y-6">
                    <VerificationField
                      name="locationVerification.matches"
                      label="Location Matches Application"
                      applicationValue={
                        applicationData ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-slate-500" />
                              <span className="font-medium">
                                {applicationData.province}, {applicationData.district}, {applicationData.sector}
                              </span>
                            </div>
                            {applicationData.coordinates && (
                              <div className="text-xs text-slate-600">
                                Coordinates: {JSON.stringify(applicationData.coordinates)}
                              </div>
                            )}
                          </div>
                        ) : "Loading..."
                      }
                      applicationSectionTitle="Location Information"
                      description="Verify if the actual location matches the coordinates provided in the application"
                    />
                    <Separator />
                    
                    {/* Conditional GPS Coordinates field */}
                    {(form.watch("locationVerification.matches") === "no" || 
                      form.watch("locationVerification.matches") === "partial") && (
                      <FormField
                        control={form.control}
                        name="locationVerification.actualCoordinates"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Actual GPS Coordinates</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., -1.9441, 30.0619" {...field} />
                            </FormControl>
                            <FormDescription>
                              Record the actual GPS coordinates if different from application
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                    
                    <FormField
                      control={form.control}
                      name="locationVerification.sitePlan"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Site Plan Available</FormLabel>
                            <FormDescription>
                              Check if site plan/layout drawing is available and matches reality
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                    
                    <Separator />
                    <SectionComments 
                      name="locationVerification.sectionComments"
                      label="Location Section Comments"
                    />
                  </div>
                </TabsContent>

                {/* Technical Verification Tab */}
                <TabsContent value="technical" className="space-y-6">
                  <div className="space-y-6">
                    <VerificationField
                      name="technicalVerification.waterSourceVerified"
                      label="Water Source Verification"
                      applicationValue={
                        applicationData ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Droplets className="h-4 w-4 text-blue-500" />
                              <span className="font-medium">
                                                                 {applicationData.water_source?.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) || 'Not specified'}
                              </span>
                            </div>
                            {applicationData.water_taking_method && (
                              <div className="text-xs text-slate-600">
                                Method: {applicationData.water_taking_method}
                              </div>
                            )}
                          </div>
                        ) : "Loading..."
                      }
                      applicationSectionTitle="Water Source"
                      description="Verify the water source matches the application description"
                    />
                    <Separator />
                    <VerificationField
                      name="technicalVerification.extractionMethodVerified"
                      label="Extraction Method Verification"
                      applicationValue={
                        applicationData ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Info className="h-4 w-4 text-slate-500" />
                              <span className="font-medium">
                                {applicationData.water_taking_method || 'Not specified'}
                              </span>
                            </div>
                            {applicationData.water_measuring_method && (
                              <div className="text-xs text-slate-600">
                                Measuring Method: {applicationData.water_measuring_method}
                              </div>
                            )}
                          </div>
                        ) : "Loading..."
                      }
                      applicationSectionTitle="Extraction Method"
                      description="Verify the extraction method and equipment installed"
                    />
                    <Separator />
                    <VerificationField
                      name="technicalVerification.flowMeasurementVerified"
                      label="Flow Measurement System"
                      applicationValue={
                        applicationData ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Info className="h-4 w-4 text-slate-500" />
                              <span className="font-medium">
                                {applicationData.water_measuring_method || 'Not specified'}
                              </span>
                            </div>
                            {applicationData.estimated_usage_volume && (
                              <div className="text-xs text-slate-600">
                                Estimated Usage: {applicationData.estimated_usage_volume} {applicationData.usage_unit}
                              </div>
                            )}
                          </div>
                        ) : "Loading..."
                      }
                      applicationSectionTitle="Flow Measurement"
                      description="Verify flow measurement equipment and calibration"
                    />
                    <Separator />
                    <AssessmentField
                      name="technicalVerification.infrastructureCondition"
                      label="Infrastructure Condition"
                      description="Assess the overall condition of the water extraction infrastructure"
                      options={[
                        {
                          value: "good",
                          label: "Good",
                          icon: <CheckCircle2 className="h-4 w-4 text-green-600" />,
                          color: "green"
                        },
                        {
                          value: "fair",
                          label: "Fair",
                          icon: <AlertTriangle className="h-4 w-4 text-yellow-600" />,
                          color: "yellow"
                        },
                        {
                          value: "poor",
                          label: "Poor",
                          icon: <XCircle className="h-4 w-4 text-red-600" />,
                          color: "red"
                        }
                      ]}
                    />
                    <Separator />
                    <VerificationField
                      name="technicalVerification.installationCompliance"
                      label="Installation Compliance"
                      applicationValue={
                        applicationData ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Info className="h-4 w-4 text-slate-500" />
                              <span className="font-medium">
                                {applicationData.project_title || 'Not specified'}
                              </span>
                            </div>
                            {applicationData.project_description && (
                              <div className="text-xs text-slate-600">
                                Description: {applicationData.project_description}
                              </div>
                            )}
                          </div>
                        ) : "Loading..."
                      }
                      applicationSectionTitle="Project Details"
                      description="Verify if installation meets regulatory requirements"
                    />
                    <Separator />
                    <SectionComments 
                      name="technicalVerification.sectionComments"
                      label="Technical Section Comments"
                    />
                  </div>
                </TabsContent>

                {/* Environmental Compliance Tab */}
                <TabsContent value="environmental" className="space-y-6">
                  <div className="space-y-6">
                    <AssessmentField
                      name="environmentalCompliance.impactAssessment"
                      label="Environmental Impact Assessment"
                      description="Assess the environmental impact of the water extraction project"
                      options={[
                        {
                          value: "minimal",
                          label: "Minimal Impact",
                          icon: <CheckCircle2 className="h-4 w-4 text-green-600" />,
                          color: "green"
                        },
                        {
                          value: "moderate",
                          label: "Moderate Impact",
                          icon: <AlertTriangle className="h-4 w-4 text-yellow-600" />,
                          color: "yellow"
                        },
                        {
                          value: "significant",
                          label: "Significant Impact",
                          icon: <XCircle className="h-4 w-4 text-red-600" />,
                          color: "red"
                        }
                      ]}
                    />
                    <Separator />
                    <VerificationField
                      name="environmentalCompliance.mitigationMeasures"
                      label="Mitigation Measures"
                      applicationValue={
                        applicationData ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Info className="h-4 w-4 text-green-500" />
                              <span className="font-medium">
                                {applicationData.mitigation_actions || 'Not specified'}
                              </span>
                            </div>
                            {applicationData.environmental_assessment && (
                              <div className="text-xs text-slate-600">
                                Environmental Assessment: {applicationData.environmental_assessment}
                              </div>
                            )}
                          </div>
                        ) : "Loading..."
                      }
                      applicationSectionTitle="Environmental Mitigation"
                      description="Verify implementation of environmental mitigation measures"
                    />
                    <Separator />
                    <VerificationField
                      name="environmentalCompliance.wasteManagement"
                      label="Waste Management"
                      applicationValue={
                        applicationData ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Info className="h-4 w-4 text-green-500" />
                              <span className="font-medium">
                                {applicationData.waste_disposal_method || 'Not specified'}
                              </span>
                            </div>
                            {applicationData.waste_type && (
                              <div className="text-xs text-slate-600">
                                Waste Type: {applicationData.waste_type}
                              </div>
                            )}
                          </div>
                        ) : "Loading..."
                      }
                      applicationSectionTitle="Waste Management"
                      description="Verify proper waste management practices"
                    />
                    <Separator />
                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="environmentalCompliance.vegetationImpact"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-base font-medium">Vegetation Impact</FormLabel>
                            <FormControl>
                              <RadioGroup
                                onValueChange={field.onChange}
                                value={field.value}
                                className="flex flex-row space-x-6"
                              >
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="minimal" id="veg-minimal" />
                                  <label htmlFor="veg-minimal" className="text-sm font-medium">Minimal</label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="moderate" id="veg-moderate" />
                                  <label htmlFor="veg-moderate" className="text-sm font-medium">Moderate</label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <RadioGroupItem value="significant" id="veg-significant" />
                                  <label htmlFor="veg-significant" className="text-sm font-medium">Significant</label>
                                </div>
                              </RadioGroup>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <Separator />
                    <SectionComments 
                      name="environmentalCompliance.sectionComments"
                      label="Environmental Section Comments"
                    />
                  </div>
                </TabsContent>

                {/* Regulatory Compliance Tab */}
                <TabsContent value="regulatory" className="space-y-6">
                  <div className="space-y-6">
                    <AssessmentField
                      name="regulatoryCompliance.permitConditions"
                      label="Permit Conditions"
                      description="Assess compliance with permit conditions and requirements"
                      options={[
                        {
                          value: "met",
                          label: "Met",
                          icon: <CheckCircle2 className="h-4 w-4 text-green-600" />,
                          color: "green"
                        },
                        {
                          value: "not_met",
                          label: "Not Met",
                          icon: <XCircle className="h-4 w-4 text-red-600" />,
                          color: "red"
                        },
                        {
                          value: "partially_met",
                          label: "Partially Met",
                          icon: <AlertTriangle className="h-4 w-4 text-yellow-600" />,
                          color: "yellow"
                        }
                      ]}
                    />
                    <Separator />
                    <AssessmentField
                      name="regulatoryCompliance.volumeLimits"
                      label="Volume Limits"
                      description="Assess compliance with permitted water usage volume limits"
                      options={[
                        {
                          value: "compliant",
                          label: "Compliant",
                          icon: <CheckCircle2 className="h-4 w-4 text-green-600" />,
                          color: "green"
                        },
                        {
                          value: "non_compliant",
                          label: "Non-Compliant",
                          icon: <XCircle className="h-4 w-4 text-red-600" />,
                          color: "red"
                        },
                        {
                          value: "unknown",
                          label: "Unknown",
                          icon: <AlertTriangle className="h-4 w-4 text-gray-600" />,
                          color: "gray"
                        }
                      ]}
                    />
                    <Separator />
                    <AssessmentField
                      name="regulatoryCompliance.reportingRequirements"
                      label="Reporting Requirements"
                      description="Assess compliance with regulatory reporting requirements"
                      options={[
                        {
                          value: "met",
                          label: "Met",
                          icon: <CheckCircle2 className="h-4 w-4 text-green-600" />,
                          color: "green"
                        },
                        {
                          value: "not_met",
                          label: "Not Met",
                          icon: <XCircle className="h-4 w-4 text-red-600" />,
                          color: "red"
                        },
                        {
                          value: "overdue",
                          label: "Overdue",
                          icon: <AlertTriangle className="h-4 w-4 text-orange-600" />,
                          color: "orange"
                        }
                      ]}
                    />
                    <Separator />
                    <VerificationField
                      name="regulatoryCompliance.feesUpToDate"
                      label="Fees Up to Date"
                      applicationValue={
                        applicationData ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-slate-500" />
                              <span className="font-medium">
                                {applicationData.fee_amount ? `${applicationData.fee_amount} ${applicationData.fee_currency}` : 'Not specified'}
                              </span>
                            </div>
                            {applicationData.payment_status && (
                              <div className="text-xs text-slate-600">
                                Payment Status: {applicationData.payment_status}
                              </div>
                            )}
                          </div>
                        ) : "Loading..."
                      }
                      applicationSectionTitle="Permit Fees"
                      description="Verify if all required fees are paid and up to date"
                    />
                    <Separator />
                    <SectionComments 
                      name="regulatoryCompliance.sectionComments"
                      label="Regulatory Section Comments"
                    />
                  </div>
                </TabsContent>

                {/* Evidence Collection Tab */}
                <TabsContent value="evidence" className="space-y-6">
                  <div className="space-y-6">
                    {/* Document Attachment Section */}
                    <div className="space-y-4">
                      <FormLabel className="text-base font-medium">Document Attachment</FormLabel>
                      <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6">
                        <div className="space-y-4">
                          <div className="flex items-center justify-center">
                            <Button
                              type="button"
                              variant="outline"
                              className="flex items-center gap-2"
                              onClick={() => {
                                const input = document.createElement('input')
                                input.type = 'file'
                                input.multiple = true
                                input.accept = '.pdf,.jpg,.jpeg,.png'
                                input.onchange = (e) => {
                                  const files = (e.target as HTMLInputElement).files
                                  if (files) {
                                    const currentAttachments = form.getValues("evidenceCollection.attachments") || []
                                    const newAttachments = Array.from(files).map(file => ({
                                      id: crypto.randomUUID(),
                                      name: file.name,
                                      type: file.type,
                                      size: file.size,
                                      url: URL.createObjectURL(file)
                                    }))
                                    form.setValue("evidenceCollection.attachments", [...currentAttachments, ...newAttachments])
                                  }
                                }
                                input.click()
                              }}
                            >
                              Choose Files
                            </Button>
                          </div>
                          <FormDescription className="text-center">
                            Upload PDFs or images (JPG, PNG) of your inspection evidence.<br/>
                            Max size: 5MB per file. Multiple files allowed.
                          </FormDescription>
                        </div>
                      </div>
                      
                      {/* Display attached files */}
                      {form.watch("evidenceCollection.attachments")?.map((attachment, index) => (
                        <div key={attachment.id} className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-green-600" />
                            <span className="text-sm font-medium text-green-800">{attachment.name}</span>
                            <span className="text-xs text-green-600">
                              ({(attachment.size / 1024 / 1024).toFixed(2)} MB)
                            </span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-800"
                            onClick={() => {
                              const attachments = form.getValues("evidenceCollection.attachments") || []
                              const updatedAttachments = attachments.filter((_, i) => i !== index)
                              form.setValue("evidenceCollection.attachments", updatedAttachments)
                            }}
                          >
                            ×
                          </Button>
                        </div>
                      ))}
                    </div>
                    
                    <Separator />
                    
                    {/* Samples Section */}
                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="evidenceCollection.samplesCollected"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>Samples Collected</FormLabel>
                              <FormDescription>
                                Check if water/soil samples were collected
                              </FormDescription>
                            </div>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="evidenceCollection.sampleTypes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Sample Types</FormLabel>
                            <FormControl>
                              <Textarea 
                                placeholder="Describe types of samples collected..."
                                {...field}
                                rows={2}
                                disabled={!form.watch("evidenceCollection.samplesCollected")}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <Separator />
                    
                    <FormField
                      control={form.control}
                      name="evidenceCollection.gpsCoordinates"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>GPS Coordinates for Evidence</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., -1.9441, 30.0619" {...field} />
                          </FormControl>
                          <FormDescription>
                            Record GPS coordinates where evidence was collected
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <Separator />
                    
                    <SectionComments 
                      name="evidenceCollection.sectionComments"
                      label="Evidence Section Comments"
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex justify-between items-center">
                <div className="flex justify-between items-center w-full">
                  <div className="flex gap-2">
                    {activeTab !== "general" && (
                      <Button 
                        type="button" 
                        variant="outline"
                        onClick={() => {
                          const tabs = ["general", "location", "technical", "environmental", "regulatory", "evidence"]
                          const currentIndex = tabs.indexOf(activeTab)
                          if (currentIndex > 0) {
                            setActiveTab(tabs[currentIndex - 1])
                          }
                        }}
                        className="flex items-center gap-2"
                      >
                        ← Previous Section
                      </Button>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    {activeTab === "evidence" ? (
                      <>
                        <Button type="button" variant="outline" className="flex items-center gap-2">
                          <Save className="h-4 w-4" />
                          Save Draft
                        </Button>
                        <Button type="submit" className="flex items-center gap-2">
                          <Send className="h-4 w-4" />
                          Submit Report
                        </Button>
                      </>
                    ) : (
                      <Button 
                        type="button" 
                        onClick={() => {
                          const tabs = ["general", "location", "technical", "environmental", "regulatory", "evidence"]
                          const currentIndex = tabs.indexOf(activeTab)
                          if (currentIndex < tabs.length - 1) {
                            setActiveTab(tabs[currentIndex + 1])
                          }
                        }}
                        className="flex items-center gap-2"
                      >
                        Next Section →
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </form>
      </Form>
    </div>
  )
} 