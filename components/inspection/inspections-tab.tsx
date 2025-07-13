"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { 
  Search, 
  Eye, 
  Edit, 
  FileCheck, 
  Calendar,
  MapPin,
  User,
  Send,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2
} from "lucide-react"
import Link from "next/link"
import { getInspectionsByInspector, getAllInspections, getCurrentUser } from "@/lib/supabase"

interface Inspection {
  id: string
  inspection_number: string
  status: string
  result?: string
  scheduled_date: string
  completed_date?: string
  recommendations?: string
  location_verified?: boolean
  technical_compliance?: boolean
  environmental_compliance?: boolean
  regulatory_compliance?: boolean
  application: {
    id: string
    application_number: string
    project_title: string
    water_source: string
    province: string
    district: string
    sector: string
    applicant: {
      first_name: string
      last_name: string
      company_name?: string
      email: string
      phone: string
    }
  }
  inspector: {
    first_name: string
    last_name: string
    email: string
  }
}

export function InspectionsTab() {
  const [inspections, setInspections] = useState<Inspection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [complianceFilter, setComplianceFilter] = useState("all")

  useEffect(() => {
    const fetchInspections = async () => {
      try {
        setLoading(true)
        
        // Get current user to determine if they're an inspector or admin
        const user = await getCurrentUser()
        let data
        
        if (user?.app_metadata?.role === 'inspector') {
          data = await getInspectionsByInspector(user.id)
        } else {
          // Admin or reviewer can see all inspections
          data = await getAllInspections()
        }
        
        setInspections(data || [])
      } catch (err) {
        console.error('Error fetching inspections:', err)
        setError('Failed to load inspections')
      } finally {
        setLoading(false)
      }
    }

    fetchInspections()
  }, [])

  const filteredInspections = inspections.filter(inspection => {
    const applicantName = inspection.application.applicant.company_name || 
                         `${inspection.application.applicant.first_name} ${inspection.application.applicant.last_name}`
    
    const matchesSearch = applicantName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         inspection.inspection_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         inspection.application.application_number.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesStatus = statusFilter === "all" || inspection.status.toLowerCase() === statusFilter.toLowerCase()
    
    const matchesCompliance = complianceFilter === "all" || 
                             (inspection.result && inspection.result.toLowerCase() === complianceFilter.toLowerCase())
    
    return matchesSearch && matchesStatus && matchesCompliance
  })



  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "scheduled": return "bg-blue-100 text-blue-800 hover:bg-blue-100"
      case "in_progress": return "bg-yellow-100 text-yellow-800 hover:bg-yellow-100"
      case "completed": return "bg-green-100 text-green-800 hover:bg-green-100"
      case "cancelled": return "bg-red-100 text-red-800 hover:bg-red-100"
      default: return "bg-gray-100 text-gray-800 hover:bg-gray-100"
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case "scheduled": return <Clock className="h-3 w-3 mr-1" />
      case "in_progress": return <FileCheck className="h-3 w-3 mr-1" />
      case "completed": return <CheckCircle2 className="h-3 w-3 mr-1" />
      case "cancelled": return <XCircle className="h-3 w-3 mr-1" />
      default: return null
    }
  }

  const getComplianceColor = (result: string) => {
    switch (result.toLowerCase()) {
      case "passed": return "bg-green-100 text-green-800 hover:bg-green-100"
      case "failed": return "bg-red-100 text-red-800 hover:bg-red-100"
      case "conditional": return "bg-yellow-100 text-yellow-800 hover:bg-yellow-100"
      default: return "bg-gray-100 text-gray-800 hover:bg-gray-100"
    }
  }

  const getComplianceIcon = (result: string) => {
    switch (result.toLowerCase()) {
      case "passed": return <CheckCircle2 className="h-3 w-3 mr-1" />
      case "failed": return <XCircle className="h-3 w-3 mr-1" />
      case "conditional": return <AlertTriangle className="h-3 w-3 mr-1" />
      default: return null
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  const getLocationString = (inspection: Inspection) => {
    return `${inspection.application.district}, ${inspection.application.sector}`
  }

  const getApplicantName = (inspection: Inspection) => {
    return inspection.application.applicant.company_name || 
           `${inspection.application.applicant.first_name} ${inspection.application.applicant.last_name}`
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading inspections...</span>
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

  return (
    <div className="space-y-4">
      {/* Search and Filter Controls */}
      <div className="flex flex-col md:flex-row gap-4 p-4 border rounded-lg">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by applicant name, inspection number, or application number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-48">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={complianceFilter} onValueChange={setComplianceFilter}>
          <SelectTrigger className="w-full md:w-48">
            <SelectValue placeholder="Filter by result" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Results</SelectItem>
            <SelectItem value="passed">Passed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="conditional">Conditional</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Inspections Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            My Inspections ({filteredInspections.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Inspection</TableHead>
                  <TableHead>Applicant</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInspections.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No inspections found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInspections.map((inspection) => (
                    <TableRow key={inspection.id} className="hover:bg-muted/50">
                      <TableCell>
                        <div className="font-medium">{inspection.inspection_number}</div>
                        <div className="text-sm text-muted-foreground">
                          App: {inspection.application.application_number}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{getApplicantName(inspection)}</div>
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {inspection.inspector.first_name} {inspection.inspector.last_name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">{getLocationString(inspection)}</span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {getWaterSourceLabel(inspection.application.water_source)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(inspection.status)}>
                          {getStatusIcon(inspection.status)}
                          {inspection.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {inspection.result ? (
                          <Badge className={getComplianceColor(inspection.result)}>
                            {getComplianceIcon(inspection.result)}
                            {inspection.result}
                          </Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">Pending</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">
                            {inspection.completed_date 
                              ? formatDate(inspection.completed_date)
                              : formatDate(inspection.scheduled_date)
                            }
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {inspection.completed_date ? 'Completed' : 'Scheduled'}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link href={`/inspection/${inspection.id}`}>
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                          {inspection.status !== 'completed' && (
                            <Link href={`/inspection/new?inspectionId=${inspection.id}`}>
                              <Button variant="ghost" size="sm">
                                <Edit className="h-4 w-4" />
                              </Button>
                            </Link>
                          )}
                          {inspection.status === 'completed' && inspection.result && (
                            <Button variant="ghost" size="sm">
                              <Send className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 