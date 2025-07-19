"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeft, 
  Loader2, 
  MapPin, 
  FileText, 
  User,
  AlertTriangle
} from "lucide-react";
import Link from "next/link";
import { useApplications } from "@/hooks/useApplications";
import { DocumentViewer } from "@/components/documents/document-viewer";
import { ApplicationComments } from "@/components/shared/ApplicationComments";
import { supabase } from "@/lib/supabase";
import type { Application, User as UserType, Document, Review } from "@/types/database";

interface ApplicationWithRelations extends Application {
  applicant?: UserType;
  documents?: Document[];
  reviews?: Review[];
}

export default function ApproverApplicationPage() {
  const params = useParams();
  const [application, setApplication] = useState<ApplicationWithRelations | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { getApplicationByNumber, loading } = useApplications();
  
  useEffect(() => {
    const fetchApplicationDetails = async () => {
      try {
        const applicationNumber = params.id as string;
        console.log('🔍 Fetching application details for number:', applicationNumber);
        
        const app = await getApplicationByNumber(applicationNumber);
        console.log('📥 Raw application data received:', app);
        
        if (app) {
          const appWithRelations = app as ApplicationWithRelations;
          
          // Now query documents using the correct application UUID
          const { data: directDocuments, error: docsError } = await supabase
            .from('documents')
            .select('*')
            .eq('application_id', app.id);
        
          console.log('🗃️ Direct documents query result:', directDocuments);
          console.log('🗃️ Direct documents error:', docsError);
          
          setApplication(appWithRelations);
          console.log('✅ Application details loaded:', appWithRelations);
          console.log('📄 Documents found:', appWithRelations.documents?.length || 0, 'documents');
          console.log('📄 Documents data:', appWithRelations.documents);
          
          // Debug documents structure
          if (appWithRelations.documents && appWithRelations.documents.length > 0) {
            console.log('📄 First document details:', appWithRelations.documents[0]);
            appWithRelations.documents.forEach((doc, index) => {
              console.log(`📄 Document ${index + 1}:`, {
                id: doc.id,
                name: doc.name,
                file_path: doc.file_path,
                type: doc.type,
                verification_status: doc.verification_status,
                upload_date: doc.upload_date
              });
            });
          } else {
            console.log('❌ No documents found in application data');
          }
        } else {
          console.log('❌ No application data received');
          setError('Application not found');
        }
      } catch (err) {
        console.error('❌ Error fetching application:', err);
        setError('Failed to load application details');
      }
    };
    
    if (params.id) {
      fetchApplicationDetails();
    }
  }, [params.id, getApplicationByNumber]);

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

  // Helper function to extract coordinates from PostGIS data
  const formatCoordinates = (coordinates: any) => {
    try {
      if (coordinates && typeof coordinates === 'object') {
        // Handle PostGIS Point geometry
        if (coordinates.type === 'Point' && coordinates.coordinates) {
          const [lng, lat] = coordinates.coordinates;
          return `${lat.toFixed(6)}°N, ${lng.toFixed(6)}°E`;
        }
      }
      return JSON.stringify(coordinates);
    } catch {
      return 'Invalid coordinates';
    }
  };

  // Helper function to format application ID
  const formatApplicationId = (application: ApplicationWithRelations) => {
    // Only show the RWB format application number, no UUID fallback
    return application.application_number || 'Pending Assignment';
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin mr-2" />
          <span>Loading application details...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="text-center py-12">
          <h2 className="font-heading mt-12 scroll-m-28 text-2xl font-medium tracking-tight first:mt-0 lg:mt-20 [&+p]:!mt-4 *:[code]:text-2xl text-red-600 mb-4">Error</h2>
          <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-muted-foreground mb-6">{error}</p>
          <Link href="/approver">
            <Button>Back to Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }
  
  if (!application) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="text-center py-12">
          <h2 className="font-heading mt-12 scroll-m-28 text-2xl font-medium tracking-tight first:mt-0 lg:mt-20 [&+p]:!mt-4 *:[code]:text-2xl mb-4">Application Not Found</h2>
          <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-muted-foreground mb-6">
            Application not found. Please check the application ID and try again.
          </p>
          <Link href="/approver">
            <Button>Back to Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex items-center mb-6">
        <Link href="/approver">
          <Button variant="ghost" className="gap-1">
            <ArrowLeft className="h-4 w-4" />
            Back to Approver Dashboard
          </Button>
        </Link>
      </div>
      
      <Tabs defaultValue="application_details" className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-primary leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] lg:font-semibold xl:text-5xl xl:tracking-tighter">{application.project_title}</h1>
            <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-muted-foreground">
              Executive Review - Application submitted on {formatDate(application.created_at)}
            </p>
          </div>
          <div className="flex flex-col gap-2 md:items-end">
            <div className="flex items-center gap-2">
              {getStatusBadge(application.status)}
            </div>
            <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-sm text-muted-foreground">
              Application ID: <span className="font-mono text-foreground font-semibold">{formatApplicationId(application)}</span>
            </p>
          </div>
        </div>

        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="application_details">Application Details</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="comments_history">Comments & History</TabsTrigger>
        </TabsList>

        <TabsContent value="application_details" className="space-y-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-8"
          >
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
            
            {/* Personal Information */}
            {application.applicant && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Applicant Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {application.applicant.account_type === 'individual' ? (
                    <>
                      <div>
                        <p className="text-sm text-muted-foreground">Full Name</p>
                        <p className="font-medium">
                          {application.applicant.first_name} {application.applicant.last_name}
                        </p>
                      </div>
                      {application.applicant.id_number && (
                        <div>
                          <p className="text-sm text-muted-foreground">National ID Number</p>
                          <p className="font-medium">{application.applicant.id_number}</p>
                        </div>
                      )}
                      {application.applicant.date_of_birth && (
                        <div>
                          <p className="text-sm text-muted-foreground">Date of Birth</p>
                          <p className="font-medium">{formatDate(application.applicant.date_of_birth)}</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div>
                        <p className="text-sm text-muted-foreground">Company Name</p>
                        <p className="font-medium">{application.applicant.company_name}</p>
                      </div>
                      {application.applicant.company_tin && (
                        <div>
                          <p className="text-sm text-muted-foreground">TIN</p>
                          <p className="font-medium">{application.applicant.company_tin}</p>
                        </div>
                      )}
                      {application.applicant.incorporation_certificate_number && (
                        <div>
                          <p className="text-sm text-muted-foreground">Incorporation Certificate</p>
                          <p className="font-medium">{application.applicant.incorporation_certificate_number}</p>
                        </div>
                      )}
                    </>
                  )}
                  
                  <div>
                    <p className="text-sm text-muted-foreground">Account Type</p>
                    <p className="font-medium">{formatApplicationType(application.applicant.account_type)}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{application.applicant.email}</p>
                  </div>
                  
                  {application.applicant.phone && (
                    <div>
                      <p className="text-sm text-muted-foreground">Phone</p>
                      <p className="font-medium">{application.applicant.phone}</p>
                    </div>
                  )}
                  
                  {application.applicant.mobile_phone && (
                    <div>
                      <p className="text-sm text-muted-foreground">Mobile Phone</p>
                      <p className="font-medium">{application.applicant.mobile_phone}</p>
                    </div>
                  )}
                  
                  {application.applicant.address && (
                    <div>
                      <p className="text-sm text-muted-foreground">Address</p>
                      <p className="font-medium">{application.applicant.address}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
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
                  {application.coordinates && (
                    <div>
                      <p className="text-sm text-muted-foreground">GPS Coordinates</p>
                      <p className="font-medium">
                        {formatCoordinates(application.coordinates)}
                      </p>
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
                  <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-muted-foreground">{application.project_description}</p>
                </CardContent>
              </Card>
            )}

            {/* Technical Details & Specifications */}
            <Card>
              <CardHeader>
                <CardTitle>🔧 Technical Information & Specifications</CardTitle>
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
                {application.return_flow_description && (
                  <div>
                    <p className="text-sm text-muted-foreground">Return Flow & Duration Details</p>
                    {application.return_flow_description.includes('|') ? (
                      <div className="space-y-2 mt-2">
                        {application.return_flow_description.split(' | ').map((detail, index) => {
                          if (!detail.trim()) return null;
                          const isStructured = detail.includes(':');
                          return (
                            <div key={index} className="pl-4 border-l-2 border-gray-200">
                              {isStructured ? (
                                <>
                                  <p className="text-xs text-muted-foreground font-medium">{detail.split(':')[0].trim()}</p>
                                  <p className="text-sm">{detail.split(':')[1]?.trim()}</p>
                                </>
                              ) : (
                                <>
                                  <p className="text-xs text-muted-foreground font-medium">Quality Description</p>
                                  <p className="text-sm">{detail}</p>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="font-medium">{application.return_flow_description}</p>
                    )}
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

            {/* Enhanced Infrastructure Details */}
            {(application.infrastructure_pipes || application.infrastructure_pumps || application.infrastructure_valves || application.infrastructure_meters) && (
              <Card>
                <CardHeader>
                  <CardTitle>🏗️ Infrastructure Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {application.infrastructure_pipes && (
                    <div>
                      <p className="text-sm text-muted-foreground">Pipes & Piping System</p>
                      <p className="font-medium">{application.infrastructure_pipes}</p>
                    </div>
                  )}
                  {application.infrastructure_pumps && (
                    <div>
                      <p className="text-sm text-muted-foreground">Pumps & Pumping System</p>
                      <p className="font-medium">{application.infrastructure_pumps}</p>
                    </div>
                  )}
                  {application.infrastructure_valves && (
                    <div>
                      <p className="text-sm text-muted-foreground">Valves & Control Systems</p>
                      <p className="font-medium">{application.infrastructure_valves}</p>
                    </div>
                  )}
                  {application.infrastructure_meters && (
                    <div>
                      <p className="text-sm text-muted-foreground">Meters & Measurement Devices</p>
                      <p className="font-medium">{application.infrastructure_meters}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Water Usage Breakdown */}
            {(application.max_daily_volume_m3 || application.max_monthly_volume_m3 || application.max_yearly_volume_m3 || application.flow_rate_m3_per_second || application.abstraction_facilities_description || application.return_flow_location || application.return_flow_volume_m3 || application.proposed_duration_months || application.proposed_duration_years || application.pumping_hours_per_day) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-green-600" />
                    📊 Water Usage Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {application.max_daily_volume_m3 && (
                      <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                        <p className="text-sm text-muted-foreground">Max Daily Volume</p>
                        <p className="font-bold text-lg text-blue-600">{application.max_daily_volume_m3.toLocaleString()} m³/day</p>
                      </div>
                    )}
                    {application.max_monthly_volume_m3 && (
                      <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                        <p className="text-sm text-muted-foreground">Max Monthly Volume</p>
                        <p className="font-bold text-lg text-green-600">{application.max_monthly_volume_m3.toLocaleString()} m³/month</p>
                      </div>
                    )}
                    {application.max_yearly_volume_m3 && (
                      <div className="p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
                        <p className="text-sm text-muted-foreground">Max Yearly Volume</p>
                        <p className="font-bold text-lg text-purple-600">{application.max_yearly_volume_m3.toLocaleString()} m³/year</p>
                      </div>
                    )}
                    {application.flow_rate_m3_per_second && (
                      <div className="p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg">
                        <p className="text-sm text-muted-foreground">Flow Rate</p>
                        <p className="font-bold text-lg text-orange-600">{application.flow_rate_m3_per_second} m³/s</p>
                      </div>
                    )}
                    {application.pumping_hours_per_day && (
                      <div className="p-3 bg-cyan-50 dark:bg-cyan-950/20 rounded-lg">
                        <p className="text-sm text-muted-foreground">Pumping Hours/Day</p>
                        <p className="font-bold text-lg text-cyan-600">{application.pumping_hours_per_day} hours</p>
                      </div>
                    )}
                    {(application.proposed_duration_months || application.proposed_duration_years) && (
                      <div className="p-3 bg-indigo-50 dark:bg-indigo-950/20 rounded-lg">
                        <p className="text-sm text-muted-foreground">Proposed Duration</p>
                        <p className="font-bold text-lg text-indigo-600">
                          {[
                            application.proposed_duration_years && `${application.proposed_duration_years} years`,
                            application.proposed_duration_months && `${application.proposed_duration_months} months`
                          ].filter(Boolean).join(', ')}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  {application.abstraction_facilities_description && (
                    <div className="pt-4 border-t">
                      <p className="text-sm text-muted-foreground">Abstraction Facilities Description</p>
                      <p className="font-medium mt-1">{application.abstraction_facilities_description}</p>
                    </div>
                  )}
                  
                  {(application.return_flow_location || application.return_flow_volume_m3) && (
                    <div className="pt-4 border-t">
                      <h4 className="font-semibold text-lg mb-3">Return Flow Information</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {application.return_flow_location && (
                          <div>
                            <p className="text-sm text-muted-foreground">Return Flow Location</p>
                            <p className="font-medium">{application.return_flow_location}</p>
                          </div>
                        )}
                        {application.return_flow_volume_m3 && (
                          <div>
                            <p className="text-sm text-muted-foreground">Return Flow Volume</p>
                            <p className="font-medium">{application.return_flow_volume_m3.toLocaleString()} m³</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

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
        </TabsContent>

        <TabsContent value="documents">
          {(() => {
            console.log('🔧 Documents tab rendering with documents:', application.documents);
            console.log('🔧 Documents array length:', application.documents?.length || 0);
            return (
              <DocumentViewer
                documents={application.documents || []}
                title="Application Documents"
                description="Documents submitted with this application"
                allowDownload={true}
                allowView={true}
                showStatus={true}
                emptyMessage="No documents have been uploaded for this application yet"
              />
            );
          })()}
        </TabsContent>

        <TabsContent value="comments_history">
          {application.id && <ApplicationComments applicationId={application.id} />}
        </TabsContent>
      </Tabs>
    </div>
  );
} 