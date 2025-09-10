"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TermsConditionsModal } from "@/components/dashboard/terms-conditions-modal";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { useAuth } from "@/contexts/AuthContext";
import { 
  ArrowLeft, 
  Loader2, 
  AlertTriangle,
  Edit
} from "lucide-react";
import Link from "next/link";
import { useApplications } from "@/hooks/useApplications";
import { useDocuments } from "@/hooks/useDocuments";
import { getDocumentUrl } from "@/lib/supabase-storage";
import type { Application, User as UserType, Document, Review } from "@/types/database";

// Lazy load the ApplicationForm component
const ApplicationForm = dynamic(
  () => import("@/components/dashboard/application-form-new").then(mod => ({ default: mod.ApplicationForm })),
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

// Transform Application data back to form format for viewing
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
    console.log('📄 Using legacy notes format parsing');
    const notesParts = notes.split(' | ');
    notesParts.forEach(part => {
      const [key, value] = part.split(': ');
      if (key && value) {
        legacyNotesMap[key] = value;
      }
    });
  }
  
  // If we have comprehensive stored data, use it directly
  if (Object.keys(storedFormData).length > 0 && storedFormData.fullNameApplicant !== undefined) {
    // New format: restore all form fields directly from stored data
    console.log('🔄 Restoring form data from comprehensive JSON storage');
    
    // Copy all stored form data
    Object.assign(formData, storedFormData);
    
    // Override with profile data for contact information if available
    if (userProfile) {
      formData.telephoneContact = userProfile.phone || userProfile.company_phone || formData.telephoneContact;
      formData.emailAddress = userProfile.email || formData.emailAddress;
    }
    
    // Ensure coordinates are properly formatted
    if (formData.waterSourceCoordinates && Array.isArray(formData.waterSourceCoordinates)) {
      // Coordinates are already properly stored
    } else {
      // Initialize empty coordinates if missing
      formData.waterSourceCoordinates = [
        { latitude: "", longitude: "" },
        { latitude: "", longitude: "" },
        { latitude: "", longitude: "" },
        { latitude: "", longitude: "" },
        { latitude: "", longitude: "" }
      ];
    }
    
  } else {
    // Legacy format: reconstruct from basic database fields and legacy notes
    console.log('🔄 Restoring form data from legacy format');
    
    // Basic applicant information (using internal notes and project title)
    formData.fullNameApplicant = application.project_title?.replace(' Water Permit Application', '') || 'Draft Application';
    formData.categoryApplicant = legacyNotesMap['Category']?.toLowerCase() || 'individual';
  
    // Office address (from application location) - reverse the province mapping
    // Map database province names to Rwanda administrative data keys
    const provinceReverseMap: Record<string, string> = {
      'Kigali': 'Kigali',
      'Northern': 'North',
      'Southern': 'South',
      'Eastern': 'East',
      'Western': 'West'
    };
    formData.officeProvince = provinceReverseMap[application.province] || application.province || '';
    formData.officeDistrict = application.district || '';
    formData.officeSector = application.sector || '';
    formData.officeCell = application.cell || '';
    formData.officeVillage = application.village || '';
    
    // Contact information - use profile data if available, otherwise try to extract from notes
    formData.telephoneContact = userProfile?.phone || userProfile?.company_phone || '';
    formData.emailAddress = userProfile?.email || legacyNotesMap['Contact']?.replace('Not provided', '') || '';
  
    // Water source information
    const waterSourceMap: Record<string, string> = {
      'surface_water': 'stream_river',
      'groundwater': 'borehole'
    };
    formData.waterSourceType = waterSourceMap[application.water_source] || 'stream_river';
    formData.nameSourceWater = application.water_body_name || '';
    formData.tributaryToMain = application.tributary_name || '';
    
    // Water source location (same as office for now) - reverse the province mapping
    formData.waterSourceProvince = provinceReverseMap[application.province] || application.province || '';
    formData.waterSourceDistrict = application.district || '';
    formData.waterSourceSector = application.sector || '';
    formData.waterSourceCell = application.cell || '';
    formData.waterSourceVillage = application.village || '';
  
    // Coordinates - handle both old Point format and new Polygon format
    if (application.coordinates && typeof application.coordinates === 'object') {
      try {
        const coords = application.coordinates as any;
        if (coords.type === 'Polygon' && Array.isArray(coords.coordinates) && coords.coordinates[0]) {
          // New polygon format - extract the 5 points
          const polygonPoints = coords.coordinates[0];
          formData.waterSourceCoordinates = polygonPoints.slice(0, 5).map((point: number[]) => ({
            latitude: point[1].toString(),
            longitude: point[0].toString()
          }));
          // Fill remaining slots if less than 5 points
          while (formData.waterSourceCoordinates.length < 5) {
            formData.waterSourceCoordinates.push({ latitude: "", longitude: "" });
          }
        } else if (coords.type === 'Point' && Array.isArray(coords.coordinates) && coords.coordinates.length >= 2) {
          // Legacy point format - convert to first coordinate of polygon
          formData.waterSourceCoordinates = [
            { latitude: coords.coordinates[1].toString(), longitude: coords.coordinates[0].toString() },
            { latitude: "", longitude: "" },
            { latitude: "", longitude: "" },
            { latitude: "", longitude: "" },
            { latitude: "", longitude: "" }
          ];
        } else {
          // Invalid format - initialize empty
          formData.waterSourceCoordinates = [
            { latitude: "", longitude: "" },
            { latitude: "", longitude: "" },
            { latitude: "", longitude: "" },
            { latitude: "", longitude: "" },
            { latitude: "", longitude: "" }
          ];
        }
      } catch (error) {
        console.warn('Error parsing coordinates:', error);
        formData.waterSourceCoordinates = [
          { latitude: "", longitude: "" },
          { latitude: "", longitude: "" },
          { latitude: "", longitude: "" },
          { latitude: "", longitude: "" },
          { latitude: "", longitude: "" }
        ];
      }
    } else {
      formData.waterSourceCoordinates = [
        { latitude: "", longitude: "" },
        { latitude: "", longitude: "" },
        { latitude: "", longitude: "" },
        { latitude: "", longitude: "" },
        { latitude: "", longitude: "" }
      ];
    }
  
    // Water reliability
    formData.waterReliability = 'water_always_available'; // Default
    
    // Intended activities - reverse map from application_type and water_purpose
    const activityMap: Record<string, string[]> = {
      'domestic': ['water_supply'],
      'agricultural': ['irrigation', 'aquaculture'],
      'industrial': ['industry', 'coffee_washing', 'construction'],
      'commercial': ['navigation', 'recreation'],
      'municipal': ['water_supply'],
      'mining_water_use': ['mining']
    };
    
    const purposeToActivity: Record<string, string> = {
      'domestic': 'water_supply',
      'irrigation': 'irrigation', 
      'aquaculture': 'aquaculture',
      'industrial': 'industry',
      'electricity_generation': 'electricity',
      'mining': 'mining',
      'recreation': 'recreation'
    };
    
    const mappedActivity = purposeToActivity[application.water_purpose] || 'water_supply';
    formData.intendedActivities = [mappedActivity];
    
    // Water abstraction details
    if (application.estimated_usage_volume) {
      formData.waterAbstractionDetails = [{
        activity: mappedActivity,
        flowRate: '',
        flowRateUnit: 'm³/s',
        maxAverageYearly: application.estimated_usage_volume,
        abstractionMethod: application.water_taking_method || 'pump'
      }];
    } else {
      formData.waterAbstractionDetails = [{
        activity: mappedActivity,
        flowRate: '',
        flowRateUnit: 'm³/s',
        maxAverageYearly: 0,
        abstractionMethod: 'pump'
      }];
    }
    
    // Land ownership
    formData.ownsAllLand = true; // Default
    formData.hasLandAccess = true; // Default
    
    // Annexes - extract from specific fields
    if (application.electricity_generation_capacity) {
      formData.annexF_electricityDetails = application.electricity_generation_capacity;
    }
    if (application.mining_operations_type) {
      formData.annexG_miningDetails = application.mining_operations_type;
    }
  
    // Certification
    formData.certificationAgreement = true; // Must be true for saved applications
  }
  
  return formData;
}

export default function ApplicationDetailPage() {
  const params = useParams();
  const { userProfile } = useAuth();
  const [application, setApplication] = useState<ApplicationWithRelations | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [initialFormData, setInitialFormData] = useState<any>(null);
  const [initialDocuments, setInitialDocuments] = useState<Record<string, { url: string; name: string }>>({});
  const { getApplication, loading, refresh } = useApplications();
  const { getDocuments } = useDocuments();
  
  useEffect(() => {
    const fetchApplicationDetails = async () => {
      try {
        const applicationId = params.id as string;
        console.log('Fetching application details for ID:', applicationId);
        
        // Load application and documents in parallel
        const [app, documents] = await Promise.all([
          getApplication(applicationId),
          getDocuments(applicationId)
        ]);
        
        if (app) {
          const appWithRelations = app as ApplicationWithRelations;
          setApplication(appWithRelations);
          console.log('✅ Application details loaded:', appWithRelations);
          
          // Transform application data to form format
          const formData = mapApplicationToFormData(appWithRelations, userProfile);
          setInitialFormData(formData);
          
          // Process documents for form
          const documentMap: Record<string, { url: string; name: string }> = {};
          const typeMapping: Record<string, string> = {
            'identification_doc': 'identificationDoc',
            'land_ownership_doc': 'landOwnershipDoc', 
            'technical_drawings': 'technicalDrawings',
            'environmental_impact_doc': 'environmentalImpactDoc',
            'payment_proof': 'paymentProof',
            'intake_discharge_map': 'intakeDischargeMap',
            'other': 'generalRequirements', // Map 'other' type to a generic field name
            'business_license': 'miningLicense',
            'geological_survey': 'miningHydrologicalReport',
            'water_quality_report': 'waterQualityReport'
          };
          
          for (const doc of documents) {
            const fieldName = typeMapping[doc.type] || doc.type;
            if (doc.file_path && doc.name) {
              const publicUrl = getDocumentUrl(doc.file_path);
              if (publicUrl) {
                documentMap[fieldName] = {
                  url: publicUrl,
                  name: doc.name
                };
              }
            }
          }
          
          setInitialDocuments(documentMap);
          
          console.log('📄 Documents found:', documents.length, 'documents');
          
          // Show Terms modal if status is approved_pending_permit
          if (appWithRelations.status === 'approved_pending_permit') {
            setTermsModalOpen(true);
          }
        } else {
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
  }, [params.id, getApplication, getDocuments, userProfile]);

  // Create userData object for the form (similar to new-application page)
  const userData = {
    email: userProfile?.email || "",
    name: `${userProfile?.first_name || ''} ${userProfile?.last_name || ''}`.trim() || userProfile?.company_name || "",
    phone: userProfile?.phone || userProfile?.company_phone || "",
    address: userProfile?.company_address || "",
    idNumber: userProfile?.id_number || "",
    account_type: userProfile?.account_type || 'individual' as const,
    id_number: userProfile?.id_number || "",
    company_tin: userProfile?.company_tin,
  };

  // Dummy handlers for read-only form (these won't be called)
  const handleSubmitApplication = async () => {};
  const handleSaveAsDraft = async () => {};

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
      case "approved_pending_permit":
        return <Badge variant="outline" className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200">Pending Terms Acceptance</Badge>;
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
        // Handle PostGIS Point geometry (legacy)
        if (coordinates.type === 'Point' && coordinates.coordinates) {
          const [lng, lat] = coordinates.coordinates;
          return `${lat.toFixed(6)}°N, ${lng.toFixed(6)}°E`;
        }
        
        // Handle PostGIS Polygon geometry (new format)
        if (coordinates.type === 'Polygon' && coordinates.coordinates && coordinates.coordinates[0]) {
          const polygonPoints = coordinates.coordinates[0];
          return `Polygon with ${polygonPoints.length} points`;
        }
      }
      return JSON.stringify(coordinates);
    } catch (error) {
      return 'Invalid coordinates';
    }
  };

  // Helper function to render detailed polygon coordinates
  const renderPolygonCoordinates = (coordinates: any) => {
    try {
      if (coordinates?.type === 'Polygon' && coordinates.coordinates?.[0]) {
        const points = coordinates.coordinates[0];
        return (
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">
              Water Source Area (Polygon - {points.length} points):
            </div>
            <div className="grid gap-2">
              {points.slice(0, 5).map((point: number[], index: number) => (
                <div key={index} className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm">
                  <span className="font-medium">Point {index + 1}:</span>
                  <span>{point[1].toFixed(6)}°N, {point[0].toFixed(6)}°E</span>
                </div>
              ))}
            </div>
          </div>
        );
      }
      
      if (coordinates?.type === 'Point' && coordinates.coordinates) {
        const [lng, lat] = coordinates.coordinates;
        return (
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">
              Water Source Location (Point):
            </div>
            <div className="p-2 bg-muted/50 rounded text-sm">
              {lat.toFixed(6)}°N, {lng.toFixed(6)}°E
            </div>
          </div>
        );
      }
      
      return <div className="text-sm text-muted-foreground">No coordinates available</div>;
    } catch (error) {
      return <div className="text-sm text-red-500">Invalid coordinate data</div>;
    }
  };

  // Helper function to format application ID
  const formatApplicationId = (application: ApplicationWithRelations) => {
    // Only show the RWB format application number, no UUID fallback
    return application.application_number || 'Pending Assignment';
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
            <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-muted-foreground mb-6">{error}</p>
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
            <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-muted-foreground mb-6">
              Application not found. Please check the application ID and try again.
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
    <ProtectedRoute allowedRoles={['applicant']} requireProfile={true}>
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
              <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-muted-foreground">
                Application submitted on {formatDate(application.created_at)} • Read-only view
              </p>
            </div>
            <div className="flex flex-col gap-2 md:items-end">
              <div className="flex items-center gap-2">
                {getStatusBadge(application.status)}
                {(application.status === 'revision_required' || application.status === 'draft') && (
                  <Link href={`/dashboard/edit-application/${application.id}`}>
                    <Button variant="outline" size="sm">
                      <Edit className="h-4 w-4 mr-2" />
                      Edit Application
                    </Button>
                  </Link>
                )}
              </div>
              <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-sm text-muted-foreground">
                Application ID: <span className="font-mono text-foreground font-semibold">{formatApplicationId(application)}</span>
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
                  <div className="flex gap-2">
                    <Link href={`/dashboard/edit-application/${application.id}`}>
                      <Button variant="outline" size="sm" className="bg-white hover:bg-orange-50 border-orange-300">
                        <Edit className="h-4 w-4 mr-2" />
                        Edit Application
                      </Button>
                    </Link>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}
          
          {/* Application Form in Read-only Mode */}
          {initialFormData && (
            <ApplicationForm 
              userData={userData}
              onSubmit={handleSubmitApplication}
              onSaveAsDraft={handleSaveAsDraft}
              isLoading={false}
              initialData={initialFormData}
              initialDocuments={initialDocuments}
              mode="view"
              readOnly={true}
            />
          )}

        </motion.div>
      </div>

      {/* Terms & Conditions Modal */}
      {application && application.status === 'approved_pending_permit' && (
        <TermsConditionsModal
          isOpen={termsModalOpen}
          onClose={() => setTermsModalOpen(false)}
          applicationId={application.id}
          applicationNumber={application.application_number || ''}
          projectTitle={application.project_title}
          onTermsAccepted={() => {
            refresh();
            setTermsModalOpen(false);
          }}
        />
      )}
      
    </DashboardLayout>
    </ProtectedRoute>
  );
} 
