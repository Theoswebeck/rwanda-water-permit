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
  FileCheck, 
  MapPin, 
  Calendar,
  Droplets,
  AlertCircle,
  Loader2,
  ClipboardCheck
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { supabase } from "@/lib/supabase"

interface Application {
  id: string
  application_number: string
  status: string
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

export function AssessmentTab() {
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")

  useEffect(() => {
    const fetchApplications = async () => {
      try {
        setLoading(true)
        
        // Fetch applications that are pending assessment
        const { data, error } = await supabase
          .from('applications')
          .select(`
            *,
            applicant:users!applicant_id(first_name, last_name, company_name, email, phone)
          `)
          .eq('status', 'pending_assessment')
          .order('created_at', { ascending: false })

        if (error) throw error
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

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      'pending_assessment': { 
        label: 'Pending Assessment', 
        className: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-400 dark:border-orange-800' 
      }
    }
    
    const config = statusConfig[status as keyof typeof statusConfig] || { 
      label: status, 
      className: 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950/50 dark:text-gray-400 dark:border-gray-800' 
    }
    
    return (
      <Badge 
        variant="outline" 
        className={`${config.className} text-xs font-medium px-1.5 py-0.5 rounded-full border backdrop-blur-sm whitespace-nowrap`}
      >
        {config.label}
      </Badge>
    )
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
          <span>Loading applications for assessment...</span>
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
            placeholder="Search by applicant name, application number, or project title..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm focus:bg-white dark:focus:bg-slate-800 transition-all duration-200 rounded-lg"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full md:w-48 border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm hover:bg-white dark:hover:bg-slate-800 transition-all duration-200 rounded-lg">
            <SelectValue placeholder="Filter by type" />
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
            Applications Pending Technical Assessment ({filteredApplications.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="w-full">
              <TableHeader>
                <TableRow className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium w-[25%]">Application</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium w-[25%]">Applicant</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium w-[15%]">Status</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium w-[20%] hidden md:table-cell">Location & Type</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium hidden sm:table-cell">Due Date</TableHead>
                  <TableHead className="text-right text-slate-700 dark:text-slate-300 font-medium">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredApplications.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <div className="text-muted-foreground/50 text-lg">
                          No applications pending assessment
                        </div>
                        <div className="text-sm text-muted-foreground/70">
                          Applications requiring technical assessment will appear here
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
                      <TableCell className="p-2 sm:p-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100 text-sm truncate">
                          {app.application_number}
                        </div>
                      </TableCell>
                      <TableCell className="p-2 sm:p-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100 text-sm truncate">
                          {getApplicantName(app)}
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-400 truncate">
                          {getWaterPurposeLabel(app.water_purpose)}
                        </div>
                      </TableCell>
                      <TableCell className="p-2 sm:p-3">
                        <div className="flex justify-center">
                          {getStatusBadge('pending_assessment')}
                        </div>
                      </TableCell>
                      <TableCell className="p-2 sm:p-3 hidden md:table-cell">
                        <div className="flex items-center gap-1 mb-1">
                          <MapPin className="h-3 w-3 text-slate-500 dark:text-slate-400 shrink-0" />
                          <span className="text-xs text-slate-700 dark:text-slate-300 truncate">
                            {getLocationString(app)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Droplets className="h-3 w-3 text-slate-500 dark:text-slate-400 shrink-0" />
                          <span className="text-xs text-slate-700 dark:text-slate-300 truncate">
                            {getWaterSourceLabel(app.water_source)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="p-2 sm:p-3 hidden sm:table-cell">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-slate-500 dark:text-slate-400 shrink-0" />
                          <span className="text-xs text-slate-700 dark:text-slate-300">
                            {app.due_date ? formatDate(app.due_date) : 'Not set'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="p-2 sm:p-3 text-right">
                        <Link href={`/inspection/assessment/${encodeURIComponent(app.application_number)}`}>
                          <Button 
                            size="sm" 
                            className="flex items-center gap-1 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white border-0 shadow-sm hover:shadow-md transition-all duration-200 rounded-lg px-2 py-1 text-xs font-medium"
                          >
                            <ClipboardCheck className="h-3 w-3" />
                            <span className="hidden sm:inline">Assess</span>
                            <span className="sm:hidden">Go</span>
                          </Button>
                        </Link>
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




