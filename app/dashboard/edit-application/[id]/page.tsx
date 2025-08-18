"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter, useParams } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { ApplicationForm } from "@/components/dashboard/application-form-new";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { useApplications } from "@/hooks/useApplications";
import { DocumentViewer } from "@/components/documents/document-viewer";
import type { Application, Document, User as UserType } from "@/types/database";

interface ApplicationWithRelations extends Application {
  applicant?: UserType;
  documents?: Document[];
}

// Helper function to capitalize province names for database enum compatibility
function formatProvinceForDB(province: string): Application['province'] | undefined {
  if (!province) return undefined;
  const provinceMap: Record<string, Application['province']> = {
    'kigali': 'Kigali',
    'northern': 'Northern', 
    'southern': 'Southern',
    'eastern': 'Eastern',
    'western': 'Western'
  };
  return provinceMap[province.toLowerCase()];
}

// Mapping function to transform form data to database schema
function mapFormDataToApplication(formData: any, status: 'draft' | 'submitted' = 'draft'): Partial<Application> {
  // Coordinates removed per RWB request
  const coordinates = undefined;

  return {
    // Set status based on action
    status,
    
    // Application type and water details
    application_type: formData.purpose === 'domestic' ? 'domestic' :
                     formData.purpose === 'industrial' ? 'industrial' :
                     formData.purpose === 'irrigation' ? 'agricultural' :
                     formData.purpose === 'commercial' ? 'commercial' :
                     formData.purpose === 'municipal_supply' ? 'municipal' :
                     formData.purpose === 'mining' ? 'mining_water_use' : 'domestic',
    
    water_source: formData.waterSource as Application['water_source'],
    water_purpose: formData.purpose === 'hydropower' ? 'electricity_generation' : 
                  formData.purpose as Application['water_purpose'],
    estimated_usage_volume: formData.waterUsage,
    usage_unit: formData.waterUsageUnit,
    
    // Location details - fix province mapping  
    province: formatProvinceForDB(formData.province),
    district: formData.district,
    sector: formData.sector,
    cell: formData.cell,
    village: formData.village,
    coordinates: coordinates,
    location_description: `${formData.district}, ${formData.sector}, ${formData.cell}${formData.village ? `, ${formData.village}` : ''}`,
    
    // Project information
    project_title: formData.projectTitle,
    project_description: formData.projectDescription,
    
    // Technical specifications - enhanced with all form data
    water_taking_method: formData.waterTakingMethod,
    water_measuring_method: formData.waterMeasuringMethod,
    storage_facilities: formData.storageFacilities ? 
      `${formData.storageFacilities}${formData.storageCapacity ? ` (Capacity: ${formData.storageCapacity}m³)` : ''}` : undefined,
    return_flow_description: [
      formData.returnFlowQuality,
      formData.returnFlowQuantity ? `Quantity: ${formData.returnFlowQuantity}m³/day` : '',
      formData.concessionDuration ? `Duration: ${formData.concessionDuration}` : ''
    ].filter(Boolean).join(' | '),
    
    // Industry-specific fields - enhanced with complete data
    electricity_generation_capacity: (formData.powerGenerationType || formData.installedCapacity || formData.turbineType || formData.headHeight) ? 
      [
        formData.installedCapacity ? `${formData.installedCapacity} MW` : '',
        formData.powerGenerationType ? `Type: ${formData.powerGenerationType}` : '',
        formData.turbineType ? `Turbine: ${formData.turbineType}` : '',
        formData.headHeight ? `Head: ${formData.headHeight}m` : ''
      ].filter(Boolean).join(' | ') : undefined,
    
    mining_operations_type: (formData.miningType || formData.miningMethod || formData.mineralType || formData.miningArea) ?
      [
        formData.miningType ? `Type: ${formData.miningType}` : '',
        formData.miningMethod ? `Method: ${formData.miningMethod}` : '',
        formData.mineralType ? `Mineral: ${formData.mineralType}` : '',
        formData.miningArea ? `Area: ${formData.miningArea} hectares` : ''
      ].filter(Boolean).join(' | ') : undefined,
    
    water_diversion_details: (formData.intakeLocation || formData.dischargeLocation || formData.intakeFlow || formData.dischargeFlow || formData.streamLevelVariations || formData.diversionStructureConfig) ?
      [
        formData.intakeLocation ? `Intake: ${formData.intakeLocation}` : '',
        formData.intakeFlow ? `Intake Flow: ${formData.intakeFlow}m³/s` : '',
        formData.dischargeLocation ? `Discharge: ${formData.dischargeLocation}` : '',
        formData.dischargeFlow ? `Discharge Flow: ${formData.dischargeFlow}m³/s` : '',
        formData.streamLevelVariations ? `Stream Variations: ${formData.streamLevelVariations}` : '',
        formData.diversionStructureConfig ? `Structure Config: ${formData.diversionStructureConfig}` : ''
      ].filter(Boolean).join(' | ') : undefined,
    
    // Infrastructure details - enhanced with all form data
    infrastructure_pipes: formData.pipeDetails,
    infrastructure_pumps: formData.pumpCapacity ? `Capacity: ${formData.pumpCapacity}m³/h` : undefined,
    infrastructure_valves: [
      formData.valveDetails,
      formData.backflowControlDevices ? `Backflow Control: ${formData.backflowControlDevices}` : ''
    ].filter(Boolean).join(' | '),
    infrastructure_meters: formData.meterDetails,
    
    // Environmental information
    environmental_assessment: formData.potentialEffects,
    mitigation_actions: formData.mitigationActions,
    
    // Additional metadata stored in internal_notes for permit type and applicant type
    internal_notes: [
      formData.permitType ? `Permit Type: ${formData.permitType}` : '',
      formData.applicantType ? `Applicant Type: ${formData.applicantType}` : '',
      formData.industryType ? `Industry: ${formData.industryType}` : '',
      formData.industryDetails ? `Industry Details: ${formData.industryDetails}` : ''
    ].filter(Boolean).join(' | '),
    
    // SLA tracking
    sla_status: 'on_time',
    
    // Use the sample user UUID (in real app, this would come from auth context)
    applicant_id: '550e8400-e29b-41d4-a716-446655440001',
  };
}

// Function to transform application data back to form data
function mapApplicationToFormData(application: Application): any {
  // Helper function to extract value from structured string
  const extractValue = (text: string, prefix: string): string | undefined => {
    if (!text) return undefined;
    const parts = text.split(' | ');
    const match = parts.find(part => part.startsWith(prefix));
    return match ? match.replace(prefix, '').trim() : undefined;
  };

  // Helper function to extract numeric value from structured string
  const extractNumericValue = (text: string, prefix: string): number | undefined => {
    const value = extractValue(text, prefix);
    return value ? parseFloat(value.replace(/[^\d.-]/g, '')) : undefined;
  };

  // Extract coordinates if available
  let latitude = '';
  let longitude = '';
  if (application.coordinates && typeof application.coordinates === 'object') {
    try {
      const coords = application.coordinates as any;
      if (coords.type === 'Point' && coords.coordinates) {
        longitude = coords.coordinates[0].toString();
        latitude = coords.coordinates[1].toString();
      }
    } catch (e) {
      console.log('Could not parse coordinates:', e);
    }
  }

  // Extract internal notes data
  const internalNotes = application.internal_notes || '';
  const permitType = extractValue(internalNotes, 'Permit Type:');
  const applicantType = extractValue(internalNotes, 'Applicant Type:');
  const industryType = extractValue(internalNotes, 'Industry:');
  const industryDetails = extractValue(internalNotes, 'Industry Details:');

  // Extract electricity generation details
  const electricityData = application.electricity_generation_capacity || '';
  const installedCapacity = extractNumericValue(electricityData, '');
  const powerGenerationType = extractValue(electricityData, 'Type:');
  const turbineType = extractValue(electricityData, 'Turbine:');
  const headHeight = extractNumericValue(electricityData, 'Head:');

  // Extract mining details
  const miningData = application.mining_operations_type || '';
  const miningType = extractValue(miningData, 'Type:');
  const miningMethod = extractValue(miningData, 'Method:');
  const mineralType = extractValue(miningData, 'Mineral:');
  const miningArea = extractNumericValue(miningData, 'Area:');

  // Extract water diversion details
  const diversionData = application.water_diversion_details || '';
  const intakeLocation = extractValue(diversionData, 'Intake:');
  const intakeFlow = extractNumericValue(diversionData, 'Intake Flow:');
  const intakeCoords = extractValue(diversionData, 'Intake Coords:');
  const intakeLatitude = intakeCoords ? intakeCoords.split(',')[0]?.trim() : '';
  const intakeLongitude = intakeCoords ? intakeCoords.split(',')[1]?.trim() : '';
  const intakeElevation = extractNumericValue(diversionData, 'Intake Elevation:');
  const dischargeLocation = extractValue(diversionData, 'Discharge:');
  const dischargeFlow = extractNumericValue(diversionData, 'Discharge Flow:');
  const dischargeCoords = extractValue(diversionData, 'Discharge Coords:');
  const dischargeLatitude = dischargeCoords ? dischargeCoords.split(',')[0]?.trim() : '';
  const dischargeLongitude = dischargeCoords ? dischargeCoords.split(',')[1]?.trim() : '';
  const dischargeElevation = extractNumericValue(diversionData, 'Discharge Elevation:');
  const streamLevelVariations = extractValue(diversionData, 'Stream Variations:');
  const diversionStructureConfig = extractValue(diversionData, 'Structure Config:');

  // Extract technical details
  const returnFlowData = application.return_flow_description || '';
  const returnFlowParts = returnFlowData.split(' | ');
  const returnFlowQuality = returnFlowParts[0] || '';
  const returnFlowQuantity = extractNumericValue(returnFlowData, 'Quantity:');
  const concessionDuration = extractValue(returnFlowData, 'Duration:');

  // Extract storage details
  const storageData = application.storage_facilities || '';
  const storageFacilities = storageData.includes('(Capacity:') ? 
    storageData.split('(Capacity:')[0].trim() : storageData;
  const storageCapacity = extractNumericValue(storageData, 'Capacity:');

  // Extract infrastructure details
  const valveData = application.infrastructure_valves || '';
  const valveParts = valveData.split(' | ');
  const valveDetails = valveParts[0] || '';
  const backflowControlDevices = extractValue(valveData, 'Backflow Control:');

  const pumpData = application.infrastructure_pumps || '';
  const pumpCapacity = extractNumericValue(pumpData, 'Capacity:');

  const formData = {
    fullName: "Jane Doe", // This would come from user context
    email: "jane.doe@example.com",
    phone: "+250 789 123 456",
    address: "KN 5 Ave, Kigali, Rwanda",
    
    // Permit details
    permitType: permitType || '',
    applicantType: applicantType || '',
    
    // Map database fields back to form fields
    purpose: application.water_purpose === 'electricity_generation' ? 'hydropower' : application.water_purpose,
    waterSource: application.water_source,
    waterUsage: application.estimated_usage_volume || 1,
    waterUsageUnit: application.usage_unit || '',
    
    // Location
    province: application.province ? application.province.toLowerCase() : '',
    district: application.district || '',
    sector: application.sector || '',
    cell: application.cell || '',
    village: application.village || '',
    latitude: latitude,
    longitude: longitude,
    
    // Project information
    projectTitle: application.project_title,
    projectDescription: application.project_description,
    
    // Technical specifications
    waterTakingMethod: application.water_taking_method,
    waterMeasuringMethod: application.water_measuring_method,
    storageFacilities: storageFacilities,
    storageCapacity: storageCapacity,
    returnFlowQuality: returnFlowQuality,
    returnFlowQuantity: returnFlowQuantity,
    concessionDuration: concessionDuration,
    
    // Industry-specific fields
    industryType: industryType || '',
    industryDetails: industryDetails || '',
    powerGenerationType: powerGenerationType || '',
    installedCapacity: installedCapacity,
    turbineType: turbineType || '',
    headHeight: headHeight,
    miningType: miningType || '',
    miningMethod: miningMethod || '',
    mineralType: mineralType || '',
    miningArea: miningArea,
    
    // Water diversion fields
    intakeLocation: intakeLocation || '',
    intakeFlow: intakeFlow,
    intakeLatitude: intakeLatitude,
    intakeLongitude: intakeLongitude,
    intakeElevation: intakeElevation,
    dischargeLocation: dischargeLocation || '',
    dischargeFlow: dischargeFlow,
    dischargeLatitude: dischargeLatitude,
    dischargeLongitude: dischargeLongitude,
    dischargeElevation: dischargeElevation,
    streamLevelVariations: streamLevelVariations || '',
    diversionStructureConfig: diversionStructureConfig || '',
    
    // Infrastructure details
    pipeDetails: application.infrastructure_pipes,
    pumpCapacity: pumpCapacity,
    valveDetails: valveDetails,
    meterDetails: application.infrastructure_meters,
    backflowControlDevices: backflowControlDevices || '',
    
    // Environmental information
    potentialEffects: application.environmental_assessment,
    mitigationActions: application.mitigation_actions,
    
    termsAccepted: true, // Already accepted when draft was created
  };

  // Debug logging for location fields
  console.log('🔍 Edit Application - Location data from DB:', {
    province: application.province,
    district: application.district,
    sector: application.sector,
    cell: application.cell
  });
  
  console.log('🔍 Edit Application - Mapped form data location:', {
    province: formData.province,
    district: formData.district,
    sector: formData.sector,
    cell: formData.cell
  });

  return formData;
}

export default function EditApplicationPage() {
  const router = useRouter();
  const params = useParams();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [application, setApplication] = useState<ApplicationWithRelations | null>(null);
  const [initialFormData, setInitialFormData] = useState<any>(null);
  const [loadingApplication, setLoadingApplication] = useState(true);
  
  const { getApplication, updateApplication } = useApplications();
  
  // This would typically come from a user context/state in a real application
  const userData = {
    email: "jane.doe@example.com",
    name: "Jane Doe",
    phone: "+250 789 123 456",
    address: "KN 5 Ave, Kigali, Rwanda",
    idNumber: "1 1980 8 0123456 7 89",
    account_type: 'individual' as const,
    id_number: "1 1980 8 0123456 7 89",
    company_tin: undefined,
  };

  useEffect(() => {
    const fetchApplication = async () => {
      try {
        const applicationId = params.id as string;
        console.log('Fetching application for editing:', applicationId);
        
        const app = await getApplication(applicationId);
        if (app) {
          // Check if application is editable - approved or rejected applications cannot be edited by anyone
          if (app.status === 'approved' || app.status === 'rejected') {
            setError('Approved or rejected applications cannot be edited. Please contact an administrator if changes are needed.');
            return;
          }
          
          // Check if application is editable (draft or revision_required status)
          if (app.status !== 'draft' && app.status !== 'revision_required') {
            setError('Only draft applications and applications returned for revision can be edited');
            return;
          }
          
          setApplication(app);
          const formData = mapApplicationToFormData(app);
          setInitialFormData(formData);
          console.log('✅ Application loaded for editing:', app);
          console.log('✅ Form data mapped:', formData);
        } else {
          setError('Application not found');
        }
      } catch (err) {
        console.error('❌ Error loading application:', err);
        setError('Failed to load application');
      } finally {
        setLoadingApplication(false);
      }
    };
    
    if (params.id) {
      fetchApplication();
    }
  }, [params.id, getApplication]);
  
  const handleSubmitApplication = async (formData: any, status: 'submitted') => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('Updating application, form data received:', formData);
      
      // Map form data to application schema with submitted status
      const applicationData = mapFormDataToApplication(formData, status);
      
      console.log('Mapped application data:', applicationData);
      
      // Update the application
      const updatedApplication = await updateApplication(application!.id, applicationData);
      
      if (updatedApplication) {
        console.log('✅ Application updated and submitted successfully:', updatedApplication);
        setSuccess(true);
        
        // Redirect to dashboard after a brief success message
        setTimeout(() => {
          router.push("/dashboard?tab=applications&success=application-submitted");
        }, 2000);
      } else {
        throw new Error('Failed to submit application');
      }
    } catch (error) {
      console.error('❌ Error submitting application:', error);
      setError(error instanceof Error ? error.message : 'Failed to submit application');
      setIsLoading(false);
    }
  };

  const handleSaveAsDraft = async (formData: any, status: 'draft', isAutoSave: boolean = false) => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('Updating draft, form data received:', formData);
      
      // Map form data to application schema with draft status
      const applicationData = mapFormDataToApplication(formData, status);
      
      console.log('Mapped draft application data:', applicationData);
      
      // Update the application as draft
      const updatedApplication = await updateApplication(application!.id, applicationData);
      
      if (updatedApplication) {
        console.log('✅ Application updated as draft successfully:', updatedApplication);
        
        // Only redirect and show success for manual saves, not auto-saves
        if (!isAutoSave) {
          setSuccess(true);
          
          // Redirect to dashboard after a brief success message
          setTimeout(() => {
            router.push("/dashboard?tab=applications&success=draft-updated");
          }, 2000);
        }
      } else {
        throw new Error('Failed to save draft');
      }
    } catch (error) {
      console.error('❌ Error saving draft:', error);
      setError(error instanceof Error ? error.message : 'Failed to save draft');
    } finally {
      // Always reset loading state
      setIsLoading(false);
    }
  };
  
  if (loadingApplication) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin mr-2" />
            <span>Loading application for editing...</span>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
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
          
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {error}
            </AlertDescription>
          </Alert>
        </div>
      </DashboardLayout>
    );
  }
  
  if (success) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="max-w-md mx-auto text-center py-12"
          >
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="font-heading mt-12 scroll-m-28 text-2xl font-medium tracking-tight first:mt-0 lg:mt-20 [&+p]:!mt-4 *:[code]:text-2xl text-green-900 mb-2">Success!</h2>
            <p className="text-green-700 mb-4">
              Your water permit application has been successfully updated.
            </p>
            <p className="text-sm text-muted-foreground">
              Redirecting to dashboard...
            </p>
          </motion.div>
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
          <div>
            <h1 className="text-primary leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] lg:font-semibold xl:text-5xl xl:tracking-tighter">Edit Water Permit Application</h1>
            <p className="text-muted-foreground mt-2">
              Update your draft application below. You can save changes as a draft or submit for review.
            </p>
          </div>

          {/* Documents Section */}
          {application?.documents && (
            <DocumentViewer
              documents={application.documents}
              title="Application Documents"
              description="Documents currently uploaded for this application"
              allowDownload={true}
              allowView={true}
              showStatus={true}
              emptyMessage="No documents have been uploaded for this application yet"
            />
          )}
          
          {application && initialFormData && (
            <ApplicationForm 
              userData={userData}
              onSubmit={handleSubmitApplication}
              onSaveAsDraft={handleSaveAsDraft}
              isLoading={isLoading}
              initialData={initialFormData}
              mode="edit"
            />
          )}
        </motion.div>
      </div>
    </DashboardLayout>
  );
} 