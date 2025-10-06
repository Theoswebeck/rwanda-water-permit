"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { 
  Search, 
  Eye,
  FileCheck, 
  MapPin, 
  Droplets,
  AlertCircle,
  Loader2
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { getApplicationsForInspection } from "@/lib/supabase"

interface Application {
  id: string
  application_number: string
  status: string
  water_source: string
  water_purpose: string
  province: string
  district: string
  sector: string
  project_title: string
  project_description: string
  created_at: string
  submitted_at?: string
  estimated_usage_volume?: number
  usage_unit?: string
  permit_number?: string
  inspected_at?: string
  applicant: {
    id: string
    first_name: string
    last_name: string
    company_name?: string
    email: string
    phone?: string
  }
}

export function AllApplicationsTab() {
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [waterSourceFilter, setWaterSourceFilter] = useState("all")

  // Helper functions
  const getApplicantName = (app: Application) => {
    return app.applicant.company_name || `${app.applicant.first_name} ${app.applicant.last_name}`
  }

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      'draft': { 
        label: 'Draft', 
        className: 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950/50 dark:text-gray-400 dark:border-gray-800' 
      },
      'submitted': { 
        label: 'Submitted', 
        className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-800' 
      },
      'under_review': { 
        label: 'Under Review', 
        className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800' 
      },
      'pending_assessment': { 
        label: 'Pending Assessment', 
        className: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-400 dark:border-orange-800' 
      },
      'pending_final_approval': { 
        label: 'Pending Approval', 
        className: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-400 dark:border-purple-800' 
      },
      'revision_required': { 
        label: 'Revision Required', 
        className: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800' 
      },
      'approved': { 
        label: 'Approved', 
        className: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/50 dark:text-green-400 dark:border-green-800' 
      },
      'approved_pending_permit': { 
        label: 'Pending Permit Issue', 
        className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-800' 
      },
      'pending_inspection': { 
        label: 'Pending Inspection', 
        className: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-400 dark:border-indigo-800' 
      },
      'rejected': { 
        label: 'Rejected', 
        className: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800' 
      }
    }
    
    const config = statusConfig[status as keyof typeof statusConfig] || { 
      label: status, 
      className: 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950/50 dark:text-gray-400 dark:border-gray-800' 
    }
    
    return (
      <Badge 
        variant="outline" 
        className={`${config.className} text-xs font-medium px-2 py-1 rounded-full border backdrop-blur-sm`}
      >
        {config.label}
      </Badge>
    )
  }

  useEffect(() => {
    const fetchApplications = async () => {
      try {
        setLoading(true)
        // Fetch all applications (no filtering)
        const data = await getApplicationsForInspection()
        setApplications(data || [])
      } catch (err) {
        console.error('Error fetching applications:', err)
        setError('Failed to load applications')
      } finally {
        setLoading(false)
      }
    }

    fetchApplications()
  }, [])

  const filteredApplications = applications.filter(app => {
    const applicantName = getApplicantName(app)
    const matchesSearch = applicantName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         app.application_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         app.project_title.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesStatus = statusFilter === "all" || app.status === statusFilter
    const matchesWaterSource = waterSourceFilter === "all" || app.water_source === waterSourceFilter
    
    return matchesSearch && matchesStatus && matchesWaterSource
  })

  const getLocationString = (app: Application) => {
    return `${app.district}, ${app.sector}`
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

  const getWaterPurposeLabel = (purpose: string) => {
    const labels: Record<string, string> = {
      'domestic': 'Domestic Use',
      'industrial': 'Industrial Use',
      'agricultural': 'Agricultural Use',
      'irrigation': 'Irrigation',
      'livestock': 'Livestock',
      'aquaculture': 'Aquaculture',
      'recreation': 'Recreation',
      'electricity_generation': 'Electricity Generation',
      'mining': 'Mining',
      'municipal_supply': 'Municipal Supply',
      'other': 'Other'
    }
    return labels[purpose] || purpose
  }

  const getActionButton = (application: Application) => {
    // For pre-permit assessment
    if (application.status === 'pending_assessment') {
      return (
        <Link href={`/inspection/assessment/${application.application_number}`}>
          <Button 
            size="sm" 
            className="flex items-center gap-1.5 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white border-0 shadow-sm hover:shadow-md transition-all duration-200 rounded-lg px-3 py-1.5 text-xs font-medium"
          >
            <FileCheck className="h-3.5 w-3.5" />
            Assess
          </Button>
        </Link>
      )
    }
    // For post-permit inspection
    else if (application.status === 'approved_pending_permit' || 
             (application.status === 'approved' && !application.inspected_at)) {
      return (
        <Link href={`/inspection/physical/${application.application_number}`}>
          <Button 
            size="sm" 
            className="flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white border-0 shadow-sm hover:shadow-md transition-all duration-200 rounded-lg px-3 py-1.5 text-xs font-medium"
          >
            <FileCheck className="h-3.5 w-3.5" />
            Inspect
          </Button>
        </Link>
      )
    } 
    // Default view action
    else {
      return (
        <Link href={`/inspection/application/${application.application_number}`}>
          <Button 
            size="sm" 
            variant="ghost" 
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200 rounded-lg px-3 py-1.5 text-xs font-medium border border-transparent hover:border-muted-foreground/20"
          >
            <Eye className="h-3.5 w-3.5" />
            View
          </Button>
        </Link>
      )
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading applications...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle className="h-6 w-6" />
          <span>{error}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Search and Filter Controls */}
      <div className="flex flex-col md:flex-row gap-4 p-6 bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-900 dark:to-gray-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
          <Input
            placeholder="Search all applications by applicant, application number, or project title..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm focus:bg-white dark:focus:bg-slate-800 transition-all duration-200 rounded-lg"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-48 border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm hover:bg-white dark:hover:bg-slate-800 transition-all duration-200 rounded-lg">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent className="rounded-lg border-slate-200 dark:border-slate-700">
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="under_review">Under Review</SelectItem>
            <SelectItem value="pending_assessment">Pending Assessment</SelectItem>
            <SelectItem value="pending_final_approval">Pending Approval</SelectItem>
            <SelectItem value="revision_required">Revision Required</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="approved_pending_permit">Pending Permit Issue</SelectItem>
            <SelectItem value="pending_inspection">Pending Inspection</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select value={waterSourceFilter} onValueChange={setWaterSourceFilter}>
          <SelectTrigger className="w-full md:w-48 border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm hover:bg-white dark:hover:bg-slate-800 transition-all duration-200 rounded-lg">
            <SelectValue placeholder="Filter by water source" />
          </SelectTrigger>
          <SelectContent className="rounded-lg border-slate-200 dark:border-slate-700">
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="surface_water">Surface Water</SelectItem>
            <SelectItem value="groundwater">Groundwater</SelectItem>
            <SelectItem value="borehole">Borehole</SelectItem>
            <SelectItem value="river">River</SelectItem>
            <SelectItem value="lake">Lake</SelectItem>
            <SelectItem value="spring">Spring</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Applications Table */}
      <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm rounded-xl overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-900 dark:to-gray-900 border-b border-slate-200 dark:border-slate-800">
          <CardTitle className="text-slate-900 dark:text-slate-100 font-semibold">
            All Applications ({filteredApplications.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium">Application</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium">Applicant</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium">Location</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium">Type</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium">Status</TableHead>
                  <TableHead className="text-right text-slate-700 dark:text-slate-300 font-medium">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredApplications.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <div className="text-muted-foreground/50 text-lg">
                          {applications.length === 0 ? "No applications found" : "No applications match your filters"}
                        </div>
                        <div className="text-sm text-muted-foreground/70">
                          {applications.length === 0 ? "Applications will appear here once submitted" : "Try adjusting your search or filter criteria"}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredApplications.map((app) => (
                    <TableRow 
                      key={app.id} 
                      className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors duration-150"
                    >
                      <TableCell className="p-4">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{app.application_number}</div>
                        <div className="text-sm text-slate-600 dark:text-slate-400">
                          {app.project_title}
                        </div>
                      </TableCell>
                      <TableCell className="p-4">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{getApplicantName(app)}</div>
                        <div className="text-sm text-slate-600 dark:text-slate-400">
                          {app.water_purpose ? getWaterPurposeLabel(app.water_purpose) : 'N/A'}
                        </div>
                      </TableCell>
                      <TableCell className="p-4">
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-slate-500 dark:text-slate-400" />
                          <span className="text-sm text-slate-700 dark:text-slate-300">{getLocationString(app)}</span>
                        </div>
                        <div className="text-sm text-slate-600 dark:text-slate-400">{app.province}</div>
                      </TableCell>
                      <TableCell className="p-4">
                        <div className="flex items-center gap-1">
                          <Droplets className="h-3 w-3 text-slate-500 dark:text-slate-400" />
                          <span className="text-sm text-slate-700 dark:text-slate-300">{getWaterSourceLabel(app.water_source)}</span>
                        </div>
                        {app.estimated_usage_volume && (
                          <div className="text-sm text-slate-600 dark:text-slate-400">
                            {app.estimated_usage_volume} {app.usage_unit}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="p-4">
                        {getStatusBadge(app.status)}
                      </TableCell>
                      <TableCell className="p-4 text-right">
                        {getActionButton(app)}
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




