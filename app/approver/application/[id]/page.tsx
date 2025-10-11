"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeft, 
  Loader2
} from "lucide-react";
import Link from "next/link";
import { useApplications } from "@/hooks/useApplications";
import { ApplicationComments } from "@/components/shared/ApplicationComments";
import { AssessorRecommendation } from "@/components/approver/assessor-recommendation";
import { supabase } from "@/lib/supabase";
import type { Application, User as UserType, Document, Review } from "@/types/database";

// Dynamically import ApplicationForm to avoid SSR issues
import dynamic from 'next/dynamic';

const ApplicationForm = dynamic(
  () => import('@/components/dashboard/application-form-new').then(mod => ({ default: mod.ApplicationForm })),
  {
    loading: () => (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-sm text-muted-foreground">Loading application form...</span>
      </div>
    ),
    ssr: false
  }
);

interface ApplicationWithRelations extends Application {
  applicant?: UserType;
  documents?: Document[];
  reviews?: Review[];
}

// Transform Application data back to form format for viewing (copied from review page)
function mapApplicationToFormData(application: Application, userProfile?: any): any {
  const formData: any = {};
  
  // Parse internal notes to extract form-specific data
  // Try to parse as JSON first (new format), fallback to legacy format
  let storedFormData: any = {};
  let legacyNotesMap: Record<string, string> = {};
  
  const notes = application.internal_notes || '';
  
  try {
    // Try parsing as JSON (new comprehensive format)
    storedFormData = JSON.parse(notes);
    console.log('✅ Successfully parsed stored form data from JSON');
  } catch (error) {
    // Fallback to legacy format parsing
    console.log('⚠️ Falling back to legacy notes format');
    const notesLines = notes.split('\n').filter(line => line.includes(':'));
    notesLines.forEach(line => {
      const [key, ...valueParts] = line.split(':');
      legacyNotesMap[key.trim()] = valueParts.join(':').trim();
    });
  }

  // Map basic application data
  formData.projectTitle = application.project_title || '';
  formData.applicationType = application.application_type || 'surface_water';
  formData.waterSource = application.water_source || 'lake';
  formData.waterPurpose = application.water_purpose || 'industrial';
  formData.estimatedUsage = application.estimated_usage_volume || '';
  formData.usageUnit = application.usage_unit || 'm3_per_day';
  formData.projectDescription = application.project_description || '';
  formData.projectValue = application.project_value || '';

  // Location data
  formData.province = application.province || '';
  formData.district = application.district || '';
  formData.sector = application.sector || '';
  formData.cell = application.cell || '';
  formData.village = application.village || '';

  // GPS coordinates handling
  if (application.coordinates) {
    try {
      if (typeof application.coordinates === 'object' && application.coordinates !== null) {
        const coords = application.coordinates as any;
        if (coords.type === 'Point' && coords.coordinates) {
          const [lng, lat] = coords.coordinates;
          formData.gpsCoordinates = `${lat}, ${lng}`;
        }
      } else if (typeof application.coordinates === 'string') {
        formData.gpsCoordinates = application.coordinates;
      }
    } catch (e) {
      console.warn('Error parsing coordinates:', e);
    }
  }

  // Use stored form data or legacy notes if available
  const sourceData = Object.keys(storedFormData).length > 0 ? storedFormData : legacyNotesMap;

  // Apply stored/legacy data with fallbacks
  Object.entries(sourceData).forEach(([key, value]) => {
    if (value && typeof value === 'string' && value.trim()) {
      formData[key] = value;
    }
  });

  return formData;
}

export default function ApproverApplicationPage() {
  const params = useParams();
  const [application, setApplication] = useState<ApplicationWithRelations | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [initialFormData, setInitialFormData] = useState<any>(null);
  const [initialDocuments, setInitialDocuments] = useState<Record<string, { url: string; name: string }>>({});
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
          setApplication(appWithRelations);

          // Transform application data to form format
          const formData = mapApplicationToFormData(appWithRelations, null);
          setInitialFormData(formData);
          console.log('✅ Form data mapped:', formData);

          // Process documents for form
          if (appWithRelations.documents && appWithRelations.documents.length > 0) {
            const documentsMap: Record<string, { url: string; name: string }> = {};
            
            appWithRelations.documents.forEach((doc: Document) => {
              if (doc.file_path && doc.name) {
                // Use the document type as the key for the form
                const docKey = doc.type || 'other';
                documentsMap[docKey] = {
                  url: doc.file_path,
                  name: doc.name
                };
              }
            });
            
            setInitialDocuments(documentsMap);
            console.log('✅ Documents processed for form:', documentsMap);
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
      case "pending_final_approval":
        return <Badge variant="outline" className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200">Pending Approval</Badge>;
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
          <TabsTrigger value="assessor_recommendation">Assessor Recommendation</TabsTrigger>
          <TabsTrigger value="comments_history">Comments & History</TabsTrigger>
        </TabsList>

        <TabsContent value="application_details" className="space-y-6">
          {/* Application Form in Read-only Mode */}
          {initialFormData && application && (
            <ApplicationForm 
              userData={{
                email: application.applicant?.email || "",
                name: application.applicant?.company_name || 
                      (application.applicant?.first_name && application.applicant?.last_name ? 
                       `${application.applicant.first_name} ${application.applicant.last_name}` : ""),
                phone: application.applicant?.phone || "",
                address: application.applicant?.address || "",
                idNumber: "",
                account_type: 'individual' as const,
                id_number: "",
                company_tin: "",
              }}
              onSubmit={async () => {}} // Dummy handler for read-only form
              onSaveAsDraft={async () => {}} // Dummy handler for read-only form
              isLoading={false}
              initialData={initialFormData}
              initialDocuments={initialDocuments}
              mode="view"
              readOnly={true}
            />
          )}
        </TabsContent>

        <TabsContent value="assessor_recommendation" className="space-y-6">
          <AssessorRecommendation applicationId={application.id} />
        </TabsContent>

        <TabsContent value="comments_history">
          {application.id && <ApplicationComments applicationId={application.id} />}
        </TabsContent>
      </Tabs>
    </div>
  );
} 