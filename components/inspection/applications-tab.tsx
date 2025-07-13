"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { 
  Search, 
  Filter, 
  Eye, 
  FileCheck, 
  MapPin, 
  Calendar,
  Droplets,
  AlertCircle,
  Loader2
} from "lucide-react"
import Link from "next/link"
import { getApplicationsPendingInspection } from "@/lib/supabase"

interface Application {
  id: string
  application_number: string
  applicant: {
    first_name: string
    last_name: string
    company_name?: string
    email: string
    phone: string
  }
  province: string
  district: string
  sector: string
  water_source: string
  water_purpose: string
  estimated_usage_volume: number
  usage_unit: string
  project_title: string
  project_description: string
  created_at: string
  due_date?: string
  coordinates: any // PostGIS geometry
}

export function ApplicationsTab() {
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [selectedApp, setSelectedApp] = useState<Application | null>(null)

  useEffect(() => {
    const fetchApplications = async () => {
      try {
        setLoading(true)
        const data = await getApplicationsPendingInspection()
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
    const applicantName = app.applicant.company_name || `${app.applicant.first_name} ${app.applicant.last_name}`
    const matchesSearch = applicantName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         app.application_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         app.project_title.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesType = typeFilter === "all" || app.water_source.toLowerCase() === typeFilter.toLowerCase()
    
    return matchesSearch && matchesType
  })



  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  const getLocationString = (app: Application) => {
    return `${app.district}, ${app.sector}`
  }

  const getApplicantName = (app: Application) => {
    return app.applicant.company_name || `${app.applicant.first_name} ${app.applicant.last_name}`
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
      <div className="flex flex-col md:flex-row gap-4 p-4 border rounded-lg">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by applicant name, application number, or project title..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full md:w-48">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
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
      <Card>
        <CardHeader>
          <CardTitle>
            Applications Pending Inspection ({filteredApplications.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Application</TableHead>
                  <TableHead>Applicant</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredApplications.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No applications pending inspection
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredApplications.map((app) => (
                    <TableRow key={app.id} className="hover:bg-muted/50">
                      <TableCell>
                        <div className="font-medium">{app.application_number}</div>
                        <div className="text-sm text-muted-foreground">
                          {app.project_title}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{getApplicantName(app)}</div>
                        <div className="text-sm text-muted-foreground">
                          {getWaterPurposeLabel(app.water_purpose)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">{getLocationString(app)}</span>
                        </div>
                        <div className="text-sm text-muted-foreground">{app.province}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Droplets className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">{getWaterSourceLabel(app.water_source)}</span>
                        </div>
                        {app.estimated_usage_volume && (
                          <div className="text-sm text-muted-foreground">
                            {app.estimated_usage_volume} {app.usage_unit}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">
                            {app.due_date ? formatDate(app.due_date) : 'Not set'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedApp(app)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle>Application Details</DialogTitle>
                              </DialogHeader>
                              {selectedApp && (
                                <div className="space-y-4">
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <h4 className="font-semibold">Application Number</h4>
                                      <p className="text-sm text-muted-foreground">{selectedApp.application_number}</p>
                                    </div>
                                    <div>
                                      <h4 className="font-semibold">Applicant</h4>
                                      <p className="text-sm text-muted-foreground">{getApplicantName(selectedApp)}</p>
                                    </div>
                                    <div>
                                      <h4 className="font-semibold">Contact</h4>
                                      <p className="text-sm text-muted-foreground">{selectedApp.applicant.email}</p>
                                      <p className="text-sm text-muted-foreground">{selectedApp.applicant.phone}</p>
                                    </div>
                                    <div>
                                      <h4 className="font-semibold">Location</h4>
                                      <p className="text-sm text-muted-foreground">{getLocationString(selectedApp)}</p>
                                    </div>
                                    <div>
                                      <h4 className="font-semibold">Water Source</h4>
                                      <p className="text-sm text-muted-foreground">{getWaterSourceLabel(selectedApp.water_source)}</p>
                                    </div>
                                    <div>
                                      <h4 className="font-semibold">Purpose</h4>
                                      <p className="text-sm text-muted-foreground">{getWaterPurposeLabel(selectedApp.water_purpose)}</p>
                                    </div>
                                    {selectedApp.estimated_usage_volume && (
                                      <div>
                                        <h4 className="font-semibold">Estimated Volume</h4>
                                        <p className="text-sm text-muted-foreground">
                                          {selectedApp.estimated_usage_volume} {selectedApp.usage_unit}
                                        </p>
                                      </div>
                                    )}
                                    <div>
                                      <h4 className="font-semibold">Submitted Date</h4>
                                      <p className="text-sm text-muted-foreground">{formatDate(selectedApp.created_at)}</p>
                                    </div>
                                  </div>
                                  <div>
                                    <h4 className="font-semibold">Project Description</h4>
                                    <p className="text-sm text-muted-foreground mt-1">{selectedApp.project_description}</p>
                                  </div>
                                </div>
                              )}
                            </DialogContent>
                          </Dialog>
                          <Link href={`/inspection/application/${app.id}`}>
                            <Button size="sm" variant="outline" className="flex items-center gap-2">
                              <Eye className="h-4 w-4" />
                              View
                            </Button>
                          </Link>
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