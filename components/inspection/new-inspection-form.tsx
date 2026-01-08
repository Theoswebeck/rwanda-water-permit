"use client"

import { useEffect } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Button } from "@/components/ui/button"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useSearchParams } from "next/navigation"
import { TypographyH3, TypographyMuted, TypographyP } from "@/components/ui/typography"

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ACCEPTED_FILE_TYPES = ["image/jpeg", "image/jpg", "image/png", "application/pdf"]

const inspectionFormSchema = z.object({
  // General Information
  permitId: z.string().min(1, "Permit ID is required"),
  inspectionDate: z.string().min(1, "Inspection date is required"),
  inspectorName: z.string().min(1, "Inspector name is required"),

  // Location Verification
  locationAccurate: z.boolean(),
  actualLocation: z.string().optional(),
  accessibilityNotes: z.string().optional(),

  // Project Verification
  projectStatus: z.enum(["not_started", "in_progress", "completed"]),
  projectMatchesApplication: z.boolean(),
  deviationNotes: z.string().optional(),

  // Technical Verification
  waterSourceVerified: z.boolean(),
  extractionMethodVerified: z.boolean(),
  flowMeasurementVerified: z.boolean(),
  infrastructureCondition: z.enum(["good", "fair", "poor"]),
  technicalNotes: z.string().optional(),

  // Environmental Compliance
  environmentalImpact: z.enum(["minimal", "moderate", "significant"]),
  mitigationMeasures: z.boolean(),
  environmentalNotes: z.string().optional(),

  // Evidence
  photosCollected: z.boolean(),
  photos: z
    .array(
      z.object({
        name: z.string(),
        type: z.string(),
        size: z.number(),
        data: z.instanceof(File),
      })
    )
    .optional(),
  samplesCollected: z.boolean(),
  evidenceNotes: z.string().optional(),

  // Recommendations
  complianceStatus: z.enum(["compliant", "minor_issues", "major_violations"]),
  recommendations: z.string().min(1, "Recommendations are required"),
  followUpNeeded: z.boolean(),
})

type InspectionFormValues = z.infer<typeof inspectionFormSchema>

// Sample application data - replace with actual data fetching
const getApplicationData = async (id: string) => {
  // Simulate API call
  return {
    id: "RWB-24-00123",
    applicant: "John Doe",
    location: "Kigali, Gasabo",
    type: "Surface Water",
    permitId: id,
    notes: "Initial site visit required for water source verification",
  }
}

const defaultValues: Partial<InspectionFormValues> = {
  locationAccurate: false,
  projectMatchesApplication: false,
  waterSourceVerified: false,
  extractionMethodVerified: false,
  flowMeasurementVerified: false,
  mitigationMeasures: false,
  photosCollected: false,
  samplesCollected: false,
  followUpNeeded: false,
  photos: [],
}

export function NewInspectionForm() {
  const searchParams = useSearchParams()
  const applicationId = searchParams.get("applicationId")

  const form = useForm<InspectionFormValues>({
    resolver: zodResolver(inspectionFormSchema),
    defaultValues,
  })

  useEffect(() => {
    if (applicationId) {
      // Fetch application data and pre-fill form
      getApplicationData(applicationId).then((data) => {
        form.setValue("permitId", data.permitId)
        // Add more pre-fill values as needed
      })
    }
  }, [applicationId, form])

  function onSubmit(data: InspectionFormValues) {
    console.log(data)
    // Handle form submission
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, field: any) => {
    if (e.target.files) {
      const files = Array.from(e.target.files)
      const validFiles = files.filter(
        (file) =>
          file.size <= MAX_FILE_SIZE && ACCEPTED_FILE_TYPES.includes(file.type)
      )

      const fileData = validFiles.map((file) => ({
        name: file.name,
        type: file.type,
        size: file.size,
        data: file,
      }))

      field.onChange(fileData)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {/* General Information */}
        <div className="grid gap-4">
          <div className="space-y-2">
            <TypographyH3>General Information</TypographyH3>
            <TypographyP className="text-muted-foreground">
              Basic details about the inspection.
            </TypographyP>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="permitId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Permit ID</FormLabel>
                  <FormControl>
                    <Input placeholder="RWB-24-XXXXX" {...field} />
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
                  <FormLabel>Assessment Date</FormLabel>
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
                  <FormLabel>Assessment Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter assessment name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <Separator />

        {/* Location Verification */}
        <div className="grid gap-4">
          <div className="space-y-2">
            <TypographyH3>Location Verification</TypographyH3>
            <TypographyP className="text-muted-foreground">
              Verify the accuracy of the project location.
            </TypographyP>
          </div>
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="locationAccurate"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Location matches permit application</FormLabel>
                  </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="actualLocation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Actual Location (if different)</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="accessibilityNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Accessibility Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter any notes about site accessibility"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <Separator />

        {/* Project Verification */}
        <div className="grid gap-4">
          <div className="space-y-2">
            <TypographyH3>Project Verification</TypographyH3>
            <TypographyP className="text-muted-foreground">
              Confirm the project status and adherence to the application.
            </TypographyP>
          </div>
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="projectStatus"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select project status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="not_started">Not Started</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="projectMatchesApplication"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Project implementation matches application</FormLabel>
                  </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="deviationNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Deviation Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter any notes about project deviations"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <Separator />

        {/* Technical Verification */}
        <div className="grid gap-4">
          <div className="space-y-2">
            <TypographyH3>Technical Verification</TypographyH3>
            <TypographyP className="text-muted-foreground">
              Check the technical aspects of the water permit.
            </TypographyP>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="waterSourceVerified"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Water source verified</FormLabel>
                    </div>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="extractionMethodVerified"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Extraction method verified</FormLabel>
                    </div>
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="flowMeasurementVerified"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Flow measurement devices verified</FormLabel>
                  </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="infrastructureCondition"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Infrastructure Condition</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select condition" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="good">Good</SelectItem>
                      <SelectItem value="fair">Fair</SelectItem>
                      <SelectItem value="poor">Poor</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="technicalNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Technical Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter any technical observations or notes"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <Separator />

        {/* Environmental Compliance */}
        <div className="grid gap-4">
          <div className="space-y-2">
            <TypographyH3>Environmental Compliance</TypographyH3>
            <TypographyP className="text-muted-foreground">
              Assess the environmental impact and compliance.
            </TypographyP>
          </div>
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="environmentalImpact"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Environmental Impact Level</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select impact level" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="minimal">Minimal</SelectItem>
                      <SelectItem value="moderate">Moderate</SelectItem>
                      <SelectItem value="significant">Significant</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="mitigationMeasures"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Required mitigation measures in place</FormLabel>
                  </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="environmentalNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Environmental Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter any environmental observations or concerns"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <Separator />

        {/* Evidence Collection */}
        <div className="grid gap-4">
          <div className="space-y-2">
            <TypographyH3>Evidence Collection</TypographyH3>
            <TypographyP className="text-muted-foreground">
              Upload any relevant documents or photos.
            </TypographyP>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="photosCollected"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Photos collected</FormLabel>
                    </div>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="photos"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Upload Photos/Documents</FormLabel>
                    <FormControl>
                      <Input
                        type="file"
                        multiple
                        accept={ACCEPTED_FILE_TYPES.join(",")}
                        onChange={(e) => handleFileUpload(e, field)}
                      />
                    </FormControl>
                    <FormDescription>
                      <TypographyMuted>
                        Upload photos or documents (max 5MB each). Accepted formats: JPG, PNG, PDF
                      </TypographyMuted>
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="samplesCollected"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Water samples collected</FormLabel>
                    </div>
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="evidenceNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Evidence Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter any notes about collected evidence"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <Separator />

        {/* Recommendations */}
        <div className="grid gap-4">
          <div className="space-y-2">
            <TypographyH3>Recommendations</TypographyH3>
            <TypographyP className="text-muted-foreground">
              Provide recommendations based on the inspection.
            </TypographyP>
          </div>
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="complianceStatus"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Compliance Status</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="flex flex-col space-y-1"
                    >
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="compliant" />
                        </FormControl>
                        <FormLabel className="font-normal">
                          Fully Compliant
                        </FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="minor_issues" />
                        </FormControl>
                        <FormLabel className="font-normal">
                          Minor Issues
                        </FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="major_violations" />
                        </FormControl>
                        <FormLabel className="font-normal">
                          Major Violations
                        </FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="recommendations"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Recommendations</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter detailed recommendations based on inspection findings"
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="followUpNeeded"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Follow-up inspection needed</FormLabel>
                  </div>
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className="flex justify-end space-x-4">
          <Button variant="outline" type="button">
            Save as Draft
          </Button>
          <Button type="submit">Submit Inspection</Button>
        </div>
      </form>
    </Form>
  )
} 