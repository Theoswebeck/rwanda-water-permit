import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { CheckCircle2, XCircle, AlertCircle, Loader2, AlertTriangle } from "lucide-react"
import { getInspectionById } from "@/lib/supabase"

interface InspectionDetailProps {
  inspectionId: string
}

interface Inspection {
  id: string
  inspection_number: string
  type: string
  status: string
  result?: string
  scheduled_date: string
  completed_date?: string
  location_verified?: boolean
  coordinates_verified?: boolean
  site_plan_compliance?: boolean
  location_notes?: string
  water_source_verified?: boolean
  extraction_method_verified?: boolean
  infrastructure_condition?: string
  technical_compliance?: boolean
  technical_notes?: string
  environmental_impact_assessed?: boolean
  mitigation_measures_implemented?: boolean
  environmental_compliance?: boolean
  environmental_notes?: string
  permit_conditions_met?: boolean
  volume_limits_respected?: boolean
  reporting_up_to_date?: boolean
  fees_paid?: boolean
  regulatory_compliance?: boolean
  regulatory_notes?: string
  photos_taken?: number
  samples_collected?: number
  overall_score?: number
  recommendations?: string
  follow_up_required?: boolean
  follow_up_date?: string
  application: {
    id: string
    application_number: string
    project_title: string
    project_description: string
    water_source: string
    water_purpose: string
    province: string
    district: string
    sector: string
    cell: string
    applicant: {
      first_name: string
      last_name: string
      company_name?: string
      email: string
      phone: string
      address?: string
    }
  }
  inspector: {
    first_name: string
    last_name: string
    email: string
  }
}

export function InspectionDetail({ inspectionId }: InspectionDetailProps) {
  const [inspection, setInspection] = useState<Inspection | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchInspection = async () => {
      try {
        setLoading(true)
        const data = await getInspectionById(inspectionId)
        setInspection(data)
      } catch (err) {
        console.error('Error fetching inspection:', err)
        setError('Failed to load inspection details')
      } finally {
        setLoading(false)
      }
    }

    fetchInspection()
  }, [inspectionId])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "passed":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />
      case "failed":
        return <XCircle className="h-5 w-5 text-red-500" />
      case "conditional":
        return <AlertCircle className="h-5 w-5 text-yellow-500" />
      default:
        return null
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "passed":
        return <Badge variant="default">Passed</Badge>
      case "failed":
        return <Badge variant="destructive">Failed</Badge>
      case "conditional":
        return <Badge variant="secondary">Conditional</Badge>
      default:
        return null
    }
  }

  const getBooleanIcon = (value: boolean | null | undefined) => {
    if (value === true) return <CheckCircle2 className="h-4 w-4 text-green-500" />
    if (value === false) return <XCircle className="h-4 w-4 text-red-500" />
    return <AlertCircle className="h-4 w-4 text-yellow-500" />
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  const getApplicantName = (applicant: Inspection['application']['applicant']) => {
    return applicant.company_name || `${applicant.first_name} ${applicant.last_name}`
  }

  const getLocationString = (application: Inspection['application']) => {
    return `${application.district}, ${application.sector}, ${application.cell}`
  }

  const getWaterSourceLabel = (waterSource: string) => {
    const labels: Record<string, string> = {
      'surface_water': 'Surface Water',
      'groundwater': 'Groundwater',
      'borehole': 'Borehole',
      'river': 'River',
      'lake': 'Lake',
      'spring': 'Spring',
      'other': 'Other'
    }
    return labels[waterSource] || waterSource
  }

  const getInfrastructureConditionBadge = (condition: string) => {
    switch (condition?.toLowerCase()) {
      case "good":
        return <Badge variant="default">Good</Badge>
      case "fair":
        return <Badge variant="secondary">Fair</Badge>
      case "poor":
        return <Badge variant="destructive">Poor</Badge>
      default:
        return <Badge variant="outline">Not Assessed</Badge>
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading inspection details...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-red-600">
          <AlertTriangle className="h-6 w-6" />
          <span>{error}</span>
        </div>
      </div>
    )
  }

  if (!inspection) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-muted-foreground">
          <AlertTriangle className="h-6 w-6" />
          <span>Inspection not found</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{inspection.inspection_number}</h2>
          <p className="text-muted-foreground">
            Application: {inspection.application.application_number}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {inspection.result && getStatusIcon(inspection.result)}
          {inspection.result && getStatusBadge(inspection.result)}
        </div>
      </div>

      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Inspector</p>
              <p>{inspection.inspector.first_name} {inspection.inspector.last_name}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Inspection Date</p>
              <p>{formatDate(inspection.scheduled_date)}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Applicant</p>
              <p>{getApplicantName(inspection.application.applicant)}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Location</p>
              <p>{getLocationString(inspection.application)}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Water Source</p>
              <p>{getWaterSourceLabel(inspection.application.water_source)}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Status</p>
              <p className="capitalize">{inspection.status.replace('_', ' ')}</p>
            </div>
          </div>
          {inspection.completed_date && (
            <div>
              <p className="text-sm font-medium text-muted-foreground">Completed Date</p>
              <p>{formatDate(inspection.completed_date)}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Location Verification */}
      <Card>
        <CardHeader>
          <CardTitle>Location Verification</CardTitle>
          <CardDescription>
            Verification of project location and site accessibility
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span>Location Accurate</span>
              {getBooleanIcon(inspection.location_verified)}
            </div>
            <div className="flex items-center justify-between">
              <span>Coordinates Verified</span>
              {getBooleanIcon(inspection.coordinates_verified)}
            </div>
            <div className="flex items-center justify-between">
              <span>Site Plan Compliance</span>
              {getBooleanIcon(inspection.site_plan_compliance)}
            </div>
            {inspection.location_notes && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Notes</p>
                <p className="text-sm">{inspection.location_notes}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Technical Verification */}
      <Card>
        <CardHeader>
          <CardTitle>Technical Verification</CardTitle>
          <CardDescription>
            Technical aspects and infrastructure assessment
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span>Water Source Verified</span>
              {getBooleanIcon(inspection.water_source_verified)}
            </div>
            <div className="flex items-center justify-between">
              <span>Extraction Method Verified</span>
              {getBooleanIcon(inspection.extraction_method_verified)}
            </div>
            <div className="flex items-center justify-between">
              <span>Technical Compliance</span>
              {getBooleanIcon(inspection.technical_compliance)}
            </div>
            {inspection.infrastructure_condition && (
              <div className="flex items-center justify-between">
                <span>Infrastructure Condition</span>
                {getInfrastructureConditionBadge(inspection.infrastructure_condition)}
              </div>
            )}
            {inspection.technical_notes && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Notes</p>
                <p className="text-sm">{inspection.technical_notes}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Environmental Compliance */}
      <Card>
        <CardHeader>
          <CardTitle>Environmental Compliance</CardTitle>
          <CardDescription>
            Environmental impact and mitigation measures
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span>Environmental Impact Assessed</span>
              {getBooleanIcon(inspection.environmental_impact_assessed)}
            </div>
            <div className="flex items-center justify-between">
              <span>Mitigation Measures Implemented</span>
              {getBooleanIcon(inspection.mitigation_measures_implemented)}
            </div>
            <div className="flex items-center justify-between">
              <span>Environmental Compliance</span>
              {getBooleanIcon(inspection.environmental_compliance)}
            </div>
            {inspection.environmental_notes && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Notes</p>
                <p className="text-sm">{inspection.environmental_notes}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Regulatory Compliance */}
      <Card>
        <CardHeader>
          <CardTitle>Regulatory Compliance</CardTitle>
          <CardDescription>
            Compliance with permit conditions and regulations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span>Permit Conditions Met</span>
              {getBooleanIcon(inspection.permit_conditions_met)}
            </div>
            <div className="flex items-center justify-between">
              <span>Volume Limits Respected</span>
              {getBooleanIcon(inspection.volume_limits_respected)}
            </div>
            <div className="flex items-center justify-between">
              <span>Reporting Up to Date</span>
              {getBooleanIcon(inspection.reporting_up_to_date)}
            </div>
            <div className="flex items-center justify-between">
              <span>Fees Paid</span>
              {getBooleanIcon(inspection.fees_paid)}
            </div>
            <div className="flex items-center justify-between">
              <span>Regulatory Compliance</span>
              {getBooleanIcon(inspection.regulatory_compliance)}
            </div>
            {inspection.regulatory_notes && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Notes</p>
                <p className="text-sm">{inspection.regulatory_notes}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Evidence Collection */}
      <Card>
        <CardHeader>
          <CardTitle>Evidence Collection</CardTitle>
          <CardDescription>
            Photographic and sample evidence collected
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span>Photos Taken</span>
              <span>{inspection.photos_taken || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Samples Collected</span>
              <span>{inspection.samples_collected || 0}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recommendations */}
      {inspection.recommendations && (
        <Card>
          <CardHeader>
            <CardTitle>Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{inspection.recommendations}</p>
            {inspection.follow_up_required && (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="text-sm font-medium text-yellow-800">Follow-up Required</p>
                {inspection.follow_up_date && (
                  <p className="text-sm text-yellow-700">
                    Due: {formatDate(inspection.follow_up_date)}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Overall Score */}
      {inspection.overall_score && (
        <Card>
          <CardHeader>
            <CardTitle>Overall Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">{inspection.overall_score}/10</span>
              <div className="flex-1 bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full" 
                  style={{ width: `${(inspection.overall_score / 10) * 100}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
} 