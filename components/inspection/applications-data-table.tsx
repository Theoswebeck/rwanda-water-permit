"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"
import { TypographyH3, TypographyP } from "@/components/ui/typography"
import { ClipboardList, MoreHorizontal, FileCheck, Loader2, AlertTriangle } from "lucide-react"
import Link from "next/link"
import { getApplicationsPendingInspection } from "@/lib/supabase";
import { useErrorHandler } from "@/hooks/useErrorHandler";

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
  project_title: string
  project_description: string
  created_at: string
  due_date?: string
}

export function ApplicationsDataTable() {
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  
  const { handleErrorWithBack } = useErrorHandler();

  useEffect(() => {
    const fetchApplications = async () => {
      try {
        setLoading(true)
        const data = await getApplicationsPendingInspection()
        setApplications(data || [])
      } catch (err) {
        handleErrorWithBack(err, 'load applications');
      } finally {
        setLoading(false)
      }
    }

    fetchApplications()
  }, [])

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  const getApplicantName = (app: Application) => {
    return app.applicant.company_name || `${app.applicant.first_name} ${app.applicant.last_name}`
  }

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

  // Error handling is now done globally with automatic page reload/navigation

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-5 w-5" />
        <TypographyH3>Applications Pending Inspection ({applications.length})</TypographyH3>
      </div>
      
      {applications.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <ClipboardList className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
          <TypographyP>No applications pending inspection</TypographyP>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Application Number</TableHead>
                <TableHead>Applicant</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Submitted Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.map((application) => (
                <TableRow key={application.id}>
                  <TableCell>
                    <div className="font-medium">{application.application_number}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{getApplicantName(application)}</div>
                    <div className="text-sm text-muted-foreground">
                      {application.applicant.email}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{getLocationString(application)}</div>
                    <div className="text-sm text-muted-foreground">
                      {application.province}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {getWaterSourceLabel(application.water_source)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{formatDate(application.created_at)}</div>
                    {application.due_date && (
                      <div className="text-sm text-muted-foreground">
                        Due: {formatDate(application.due_date)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <Dialog>
                          <DialogTrigger asChild>
                            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                              View Details
                            </DropdownMenuItem>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl">
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <h4 className="font-semibold">Application Number</h4>
                                  <p className="text-sm text-muted-foreground">{application.application_number}</p>
                                </div>
                                <div>
                                  <h4 className="font-semibold">Applicant</h4>
                                  <p className="text-sm text-muted-foreground">{getApplicantName(application)}</p>
                                </div>
                                <div>
                                  <h4 className="font-semibold">Contact</h4>
                                  <p className="text-sm text-muted-foreground">{application.applicant.email}</p>
                                  <p className="text-sm text-muted-foreground">{application.applicant.phone}</p>
                                </div>
                                <div>
                                  <h4 className="font-semibold">Location</h4>
                                  <p className="text-sm text-muted-foreground">{getLocationString(application)}</p>
                                </div>
                                <div>
                                  <h4 className="font-semibold">Water Source</h4>
                                  <p className="text-sm text-muted-foreground">{getWaterSourceLabel(application.water_source)}</p>
                                </div>
                                <div>
                                  <h4 className="font-semibold">Submitted Date</h4>
                                  <p className="text-sm text-muted-foreground">{formatDate(application.created_at)}</p>
                                </div>
                              </div>
                              <div>
                                <h4 className="font-semibold">Project Description</h4>
                                <p className="text-sm text-muted-foreground mt-1">{application.project_description}</p>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                        <DropdownMenuItem asChild>
                          <Link href={`/inspection/new?applicationId=${application.id}`}>
                            <FileCheck className="h-4 w-4 mr-2" />
                            Begin Inspection
                          </Link>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
} 