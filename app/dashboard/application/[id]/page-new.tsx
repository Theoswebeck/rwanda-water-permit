"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Loader2, MapPin, FileText, Calendar, User, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useApplications } from "@/hooks/useApplications";
import type { Application } from "@/types/database";

export default function ApplicationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [application, setApplication] = useState<Application | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { getApplication, loading } = useApplications();
  
  useEffect(() => {
    const fetchApplicationDetails = async () => {
      try {
        const applicationId = params.id as string;
        console.log('Fetching application details for ID:', applicationId);
        
        const app = await getApplication(applicationId);
        if (app) {
          setApplication(app);
          console.log('✅ Application details loaded:', app);
        } else {
          setError('Application not found');
          console.log('❌ Application not found for ID:', applicationId);
        }
      } catch (err) {
        console.error('❌ Error fetching application:', err);
        setError('Failed to load application details');
      }
    };
    
    if (params.id) {
      fetchApplicationDetails();
    }
  }, [params.id, getApplication]);

  // Function to render the correct status badge  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="outline" className="bg-gray-100 text-gray-700 hover:bg-gray-100 border-gray-200">Draft</Badge>;
      case "submitted":
        return <Badge variant="outline" className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200">Submitted</Badge>;
      case "under_review":
        return <Badge variant="outline" className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200">Under Review</Badge>;
      case "pending_inspection":
        return <Badge variant="outline" className="bg-purple-100 text-purple-700 hover:bg-purple-100 border-purple-200">Pending Inspection</Badge>;
      case "approved":
        return <Badge variant="outline" className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200">Approved</Badge>;
      case "rejected":
        return <Badge variant="outline" className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200">Rejected</Badge>;
      case "pending_payment":
        return <Badge variant="outline" className="bg-orange-100 text-orange-700 hover:bg-orange-100 border-orange-200">Pending Payment</Badge>;
      case "revision_required":
        return <Badge variant="outline" className="bg-orange-100 text-orange-700 hover:bg-orange-100 border-orange-200">Revision Required</Badge>;
      case "cancelled":
        return <Badge variant="outline" className="bg-gray-100 text-gray-700 hover:bg-gray-100 border-gray-200">Cancelled</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  // Format date to be more readable
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  // Format application type for display
  const formatApplicationType = (type: string) => {
    return type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin mr-2" />
            <span>Loading application details...</span>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-6">
          <div className="text-center py-12">
            <h2 className="font-heading mt-12 scroll-m-28 text-2xl font-medium tracking-tight first:mt-0 lg:mt-20 [&+p]:!mt-4 *:[code]:text-2xl text-red-600 mb-4">Error</h2>
            <p className="text-muted-foreground mb-6">{error}</p>
            <Link href="/dashboard">
              <Button>Back to Dashboard</Button>
            </Link>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!application) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-6">
          <div className="text-center py-12">
            <h2 className="font-heading mt-12 scroll-m-28 text-2xl font-medium tracking-tight first:mt-0 lg:mt-20 [&+p]:!mt-4 *:[code]:text-2xl mb-4">Application Not Found</h2>
            <p className="text-muted-foreground mb-6">
              The application you're looking for doesn't exist or you don't have permission to view it.
            </p>
            <Link href="/dashboard">
              <Button>Back to Dashboard</Button>
            </Link>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center mb-6">
          <Link href="/dashboard">
            <Button variant="ghost" className="gap-1">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-8"
        >
          {/* Application Header */}
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-primary leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] lg:font-semibold xl:text-5xl xl:tracking-tighter">{application.project_title}</h1>
              <p className="text-muted-foreground">
                Application submitted on {formatDate(application.created_at)}
              </p>
            </div>
            <div className="flex flex-col gap-2 md:items-end">
              {getStatusBadge(application.status)}
              <p className="text-sm text-muted-foreground">
                ID: {application.application_number || application.id}
              </p>
            </div>
          </div>

          {/* Rejection Reason Alert */}
          {application.status === 'rejected' && application.rejection_reason && (
            <Alert className="border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <p className="font-medium text-red-800">Application Rejected</p>
                    <p className="text-red-700">{application.rejection_reason}</p>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Revision Notes Alert */}
          {application.status === 'revision_required' && application.revision_notes && (
            <Alert className="border-orange-200 bg-orange-50">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <AlertDescription>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <p className="font-medium text-orange-800">Application Returned for Revision</p>
                    <p className="text-orange-700">{application.revision_notes}</p>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Application Details */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Application Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Application Type</p>
                  <p className="font-medium">{formatApplicationType(application.application_type)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Water Source</p>
                  <p className="font-medium">{formatApplicationType(application.water_source)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Water Purpose</p>
                  <p className="font-medium">{formatApplicationType(application.water_purpose)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Usage</p>
                  <p className="font-medium">
                    {application.estimated_usage_volume} {application.usage_unit}
                  </p>
                </div>
                {application.project_value && (
                  <div>
                    <p className="text-sm text-muted-foreground">Project Value</p>
                    <p className="font-medium">RWF {application.project_value.toLocaleString()}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Location Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Province</p>
                  <p className="font-medium">{application.province}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">District</p>
                  <p className="font-medium">{application.district}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Sector</p>
                  <p className="font-medium">{application.sector}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Cell</p>
                  <p className="font-medium">{application.cell}</p>
                </div>
                {application.village && (
                  <div>
                    <p className="text-sm text-muted-foreground">Village</p>
                    <p className="font-medium">{application.village}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Project Description */}
          {application.project_description && (
            <Card>
              <CardHeader>
                <CardTitle>Project Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{application.project_description}</p>
              </CardContent>
            </Card>
          )}

          {/* Technical Details */}
          <Card>
            <CardHeader>
              <CardTitle>Technical Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {application.water_taking_method && (
                <div>
                  <p className="text-sm text-muted-foreground">Water Taking Method</p>
                  <p className="font-medium">{application.water_taking_method}</p>
                </div>
              )}
              {application.water_measuring_method && (
                <div>
                  <p className="text-sm text-muted-foreground">Water Measuring Method</p>
                  <p className="font-medium">{application.water_measuring_method}</p>
                </div>
              )}
              {application.storage_facilities && (
                <div>
                  <p className="text-sm text-muted-foreground">Storage Facilities</p>
                  <p className="font-medium">{application.storage_facilities}</p>
                </div>
              )}
              {application.environmental_assessment && (
                <div>
                  <p className="text-sm text-muted-foreground">Environmental Assessment</p>
                  <p className="font-medium">{application.environmental_assessment}</p>
                </div>
              )}
              {application.mitigation_actions && (
                <div>
                  <p className="text-sm text-muted-foreground">Mitigation Actions</p>
                  <p className="font-medium">{application.mitigation_actions}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Status Information */}
          <Card>
            <CardHeader>
              <CardTitle>Status Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Current Status</p>
                <div className="mt-1">{getStatusBadge(application.status)}</div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">SLA Status</p>
                <div className="mt-1">
                  <Badge variant={application.sla_status === 'on_time' ? 'default' : 'destructive'}>
                    {formatApplicationType(application.sla_status)}
                  </Badge>
                </div>
              </div>
              {application.submitted_at && (
                <div>
                  <p className="text-sm text-muted-foreground">Submitted At</p>
                  <p className="font-medium">{formatDate(application.submitted_at)}</p>
                </div>
              )}
              {application.reviewed_at && (
                <div>
                  <p className="text-sm text-muted-foreground">Reviewed At</p>
                  <p className="font-medium">{formatDate(application.reviewed_at)}</p>
                </div>
              )}
              {application.approved_at && (
                <div>
                  <p className="text-sm text-muted-foreground">Approved At</p>
                  <p className="font-medium">{formatDate(application.approved_at)}</p>
                </div>
              )}
              {application.rejection_reason && (
                <div>
                  <p className="text-sm text-muted-foreground">Rejection Reason</p>
                  <p className="font-medium text-red-600">{application.rejection_reason}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </DashboardLayout>
  );
} 