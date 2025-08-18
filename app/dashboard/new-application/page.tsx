"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { ApplicationForm } from "@/components/dashboard/application-form-new";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { useApplications } from "@/hooks/useApplications";
import { useDocuments } from "@/hooks/useDocuments";
import { uploadDocument } from "@/lib/supabase-storage";
import { supabase } from "@/lib/supabase";
import type { Application, Document } from "@/types/database";

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
  // Handle coordinates
  let coordinates = undefined;
  if (formData.waterSourceLatitude && formData.waterSourceLongitude) {
    try {
      const lat = parseFloat(formData.waterSourceLatitude);
      const lon = parseFloat(formData.waterSourceLongitude);
      if (!isNaN(lat) && !isNaN(lon)) {
        // Store as GeoJSON point for PostGIS compatibility
        coordinates = {
          type: 'Point',
          coordinates: [lon, lat] // GeoJSON uses [longitude, latitude] order
        };
      }
    } catch (error) {
      console.warn('Invalid coordinates provided:', error);
    }
  }

  // Map intended activities to application type and purpose
  const primaryActivity = formData.intendedActivities?.[0] || 'domestic';
  const waterSourceTypeMap: Record<string, Application['water_source']> = {
    'lake': 'surface_water',
    'dam': 'surface_water', 
    'spring': 'surface_water',
    'borehole': 'groundwater',
    'stream_river': 'surface_water',
    'other': 'surface_water'
  };
  
  const activityTypeMap: Record<string, Application['application_type']> = {
    'irrigation': 'agricultural',
    'water_supply': 'domestic',
    'aquaculture': 'agricultural',
    'coffee_washing': 'industrial',
    'industry': 'industrial',
    'electricity': 'industrial', // electricity generation projects are industrial
    'mining': 'mining_water_use',
    'construction': 'industrial',
    'navigation': 'commercial', // navigation is commercial activity
    'recreation': 'commercial', // recreation is commercial activity
    'other': 'domestic'
  };

  const activityPurposeMap: Record<string, Application['water_purpose']> = {
    'irrigation': 'irrigation',
    'water_supply': 'domestic',
    'aquaculture': 'aquaculture',
    'coffee_washing': 'industrial',
    'industry': 'industrial',
    'electricity': 'electricity_generation',
    'mining': 'mining',
    'construction': 'industrial',
    'navigation': 'recreation', // navigation falls under recreation
    'recreation': 'recreation',
    'other': 'domestic'
  };

  // For drafts, provide default values for required fields that might be empty
  const defaultsForDrafts = {
    water_source: waterSourceTypeMap[formData.waterSourceType] || 'surface_water',
    water_purpose: activityPurposeMap[primaryActivity] || 'domestic',
    application_type: activityTypeMap[primaryActivity] || 'domestic',
    province: formatProvinceForDB(formData.officeProvince) || 'Kigali',
    district: formData.officeDistrict || 'Draft District',
    sector: formData.officeSector || 'Draft Sector', 
    cell: formData.officeCell || 'Draft Cell',
    project_title: formData.fullNameApplicant ? `${formData.fullNameApplicant} Water Permit Application` : 'Draft Application'
  };

  const mappedData = {
    // Set status based on action
    status,
    
    // Application type and water details - with defaults for drafts
    application_type: defaultsForDrafts.application_type,
    water_source: defaultsForDrafts.water_source,
    water_purpose: defaultsForDrafts.water_purpose,
    estimated_usage_volume: formData.waterAbstractionDetails?.[0]?.maxAverageYearly,
    usage_unit: 'm³/year',
    
    // Location details - with defaults for drafts  
    province: defaultsForDrafts.province,
    district: defaultsForDrafts.district,
    sector: defaultsForDrafts.sector,
    cell: defaultsForDrafts.cell,
    village: formData.officeVillage,
    coordinates: coordinates,
    location_description: formData.officeDistrict ? 
      `${formData.officeDistrict}, ${formData.officeSector || defaultsForDrafts.sector}, ${formData.officeCell || defaultsForDrafts.cell}${formData.officeVillage ? `, ${formData.officeVillage}` : ''}` :
      'Draft location',
    
    // Project information - with defaults for drafts
    project_title: defaultsForDrafts.project_title,
    project_description: `${formData.categoryApplicant} water permit application for ${formData.intendedActivities?.join(', ') || 'water use'}`,
    
    // Technical specifications - based on new form structure
    water_taking_method: formData.waterAbstractionDetails?.[0]?.abstractionMethod || 'Not specified',
    water_measuring_method: 'Flow meter', // Default for drafts
    storage_facilities: undefined, // Will be filled when form is more complete
    return_flow_description: undefined, // Will be filled when form is more complete
    
    // Industry-specific fields - based on annexes
    electricity_generation_capacity: formData.annexF_electricityDetails,
    mining_operations_type: formData.annexG_miningDetails || 
      (formData.miningMineralsType ? `Mining: ${formData.miningMineralsType}` : undefined),
    water_diversion_details: undefined, // Will be filled based on water source details
    
    // Infrastructure details - will be enhanced as form develops
    infrastructure_pipes: undefined,
    infrastructure_pumps: undefined,
    infrastructure_valves: undefined,
    infrastructure_meters: undefined,
    
    // Environmental information - will be enhanced as form develops
    environmental_assessment: undefined,
    mitigation_actions: undefined,
    
    // Additional metadata stored in internal_notes 
    internal_notes: [
      `Category: ${formData.categoryApplicant}`,
      `Activities: ${formData.intendedActivities?.join(', ') || 'Not specified'}`,
      `Water Source: ${formData.waterSourceType || 'Not specified'}`,
      `Contact: ${formData.emailAddress || 'Not provided'}`,
      formData.waterSourceOther ? `Other water source: ${formData.waterSourceOther}` : '',
      formData.intendedActivityOther ? `Other activity: ${formData.intendedActivityOther}` : ''
    ].filter(Boolean).join(' | '),
    
    // SLA tracking
    sla_status: 'on_time' as const,
    
    // Use the sample user UUID (in real app, this would come from auth context)
    applicant_id: '550e8400-e29b-41d4-a716-446655440001',
  };

  return mappedData;
}

// Transform Application data back to form format for editing
function mapApplicationToFormData(application: Application): any {
  const formData: any = {};
  

  
  // Parse internal notes to extract form-specific data
  const notes = application.internal_notes || '';
  const notesParts = notes.split(' | ');
  const notesMap: Record<string, string> = {};
  notesParts.forEach(part => {
    const [key, value] = part.split(': ');
    if (key && value) {
      notesMap[key] = value;
    }
  });
  
  // Basic applicant information (using internal notes and project title)
  formData.fullNameApplicant = application.project_title?.replace(' Water Permit Application', '') || 'Draft Application';
  formData.categoryApplicant = notesMap['Category']?.toLowerCase() || 'individual';
  
  // Office address (from application location) - reverse the province mapping
  const provinceReverseMap: Record<string, string> = {
    'Kigali': 'kigali',
    'Northern': 'northern',
    'Southern': 'southern',
    'Eastern': 'eastern',
    'Western': 'western'
  };
  formData.officeProvince = provinceReverseMap[application.province] || application.province?.toLowerCase() || '';
  formData.officeDistrict = application.district?.toLowerCase() || '';
  formData.officeSector = application.sector?.toLowerCase() || '';
  formData.officeCell = application.cell?.toLowerCase() || '';
  formData.officeVillage = application.village || '';
  
  // Contact information (would need to be stored somewhere in the application)
  formData.telephoneContact = '';
  formData.emailAddress = notesMap['Contact']?.replace('Not provided', '') || '';
  
  // Water source information
  const waterSourceMap: Record<string, string> = {
    'surface_water': 'stream_river',
    'groundwater': 'borehole'
  };
  formData.waterSourceType = waterSourceMap[application.water_source] || 'stream_river';
  formData.nameSourceWater = 'Water Source'; // Default
  
  // Water source location (same as office for now) - reverse the province mapping
  formData.waterSourceProvince = provinceReverseMap[application.province] || application.province?.toLowerCase() || '';
  formData.waterSourceDistrict = application.district?.toLowerCase() || '';
  formData.waterSourceSector = application.sector?.toLowerCase() || '';
  formData.waterSourceCell = application.cell?.toLowerCase() || '';
  formData.waterSourceVillage = application.village || '';
  
  // Coordinates
  if (application.coordinates && typeof application.coordinates === 'object') {
    try {
      const coords = application.coordinates as any;
      if (coords.type === 'Point' && Array.isArray(coords.coordinates) && coords.coordinates.length >= 2) {
        formData.waterSourceLongitude = coords.coordinates[0].toString();
        formData.waterSourceLatitude = coords.coordinates[1].toString();
      }
    } catch (error) {
      console.warn('Error parsing coordinates:', error);
      formData.waterSourceLatitude = '';
      formData.waterSourceLongitude = '';
    }
  } else {
    formData.waterSourceLatitude = '';
    formData.waterSourceLongitude = '';
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
  

  
  return formData;
}

// Helper function to create storage bucket if it doesn't exist
async function ensureStorageBucket() {
  try {
    const bucketName = 'application-documents';
    
    // Try to get bucket info to see if it exists
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.warn('Could not list buckets:', listError);
      return;
    }
    
    const bucketExists = buckets?.some(bucket => bucket.name === bucketName);
    
    if (!bucketExists) {
      // Create the bucket
      const { error: createError } = await supabase.storage.createBucket(bucketName, {
        public: true,
        allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        fileSizeLimit: 10485760 // 10MB
      });
      
      if (createError) {
        console.warn('Could not create storage bucket:', createError);
      }
    }
  } catch (error) {
    console.warn('Storage bucket setup failed:', error);
  }
}

// Helper function to upload documents and save to database
async function uploadApplicationDocuments(applicationId: string, formData: any): Promise<Document[]> {
  try {
    const uploadedDocuments: Document[] = [];
    
    // Document type mapping
    const documentTypes = {
      paymentProof: 'payment_proof',
      identificationDoc: 'identification_doc', 
      landOwnershipDoc: 'land_ownership_doc',
      technicalDrawings: 'technical_drawings',
      environmentalImpactDoc: 'environmental_impact_doc',
      intakeDischargeMap: 'intake_discharge_map'
    };
    
    for (const [fieldName, documentType] of Object.entries(documentTypes)) {
      const file = formData[fieldName];
      
      if (file && file instanceof File) {
        try {
          // Upload file to storage
          const uploadResult = await uploadDocument(file, applicationId, fieldName);
          
          if (uploadResult) {
            // Save document record to database
            const { data: documentRecord, error: dbError } = await supabase
              .from('documents')
              .insert({
                application_id: applicationId,
                name: file.name,
                type: documentType as any,
                file_path: uploadResult.path,
                file_size: file.size,
                mime_type: file.type,
                verification_status: 'pending',
                is_required: ['paymentProof', 'identificationDoc'].includes(fieldName),
                uploaded_by: '550e8400-e29b-41d4-a716-446655440001' // Sample user ID
              })
              .select()
              .single();
              
            if (dbError) {
              console.error(`Error saving document ${fieldName} to database:`, dbError);
            } else {
              uploadedDocuments.push(documentRecord);
            }
          } else {
            console.error(`Failed to upload ${fieldName}`);
          }
        } catch (error) {
          console.error(`Error processing document ${fieldName}:`, error);
        }
      }
    }
    
    return uploadedDocuments;
  } catch (error) {
    console.error('Error uploading documents:', error);
    throw error;
  }
}

export default function NewApplicationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftId = searchParams.get('id'); // Check if we're editing an existing draft
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(!!draftId);
  const [currentApplication, setCurrentApplication] = useState<Application | null>(null);
  const [initialFormData, setInitialFormData] = useState<any>(null);
  const [initialDocuments, setInitialDocuments] = useState<Record<string, string>>({});
  
  const { createApplication, updateApplication, getApplication } = useApplications();
  const { getDocuments } = useDocuments();
  
  // Load existing draft if draftId is provided
  useEffect(() => {
    const loadDraft = async () => {
      if (!draftId) {
        setLoadingDraft(false);
        return;
      }
      
      try {
        setLoadingDraft(true);
        setError(null);
        
        const application = await getApplication(draftId);
        if (application) {
          setCurrentApplication(application);
          // Transform application data to form format
          const formData = mapApplicationToFormData(application);
          setInitialFormData(formData);
          
          // Load documents for this application
          const documents = await getDocuments(draftId);
          const documentMap: Record<string, string> = {};
          
          // Map documents by type to their file paths/URLs
          documents.forEach(doc => {
            // Map document types to form field names
            const typeMapping: Record<string, string> = {
              'identification_doc': 'identificationDoc',
              'land_ownership_doc': 'landOwnershipDoc', 
              'technical_drawings': 'technicalDrawings',
              'environmental_impact_doc': 'environmentalImpactDoc',
              'payment_proof': 'paymentProof',
              'intake_discharge_map': 'intakeDischargeMap'
            };
            
            const fieldName = typeMapping[doc.type] || doc.type;
            if (doc.file_path) {
              documentMap[fieldName] = doc.file_path;
            }
          });
          
          setInitialDocuments(documentMap);
        } else {
          setError('Draft application not found');
        }
      } catch (err) {
        console.error('Error loading draft:', err);
        setError('Failed to load draft application');
      } finally {
        setLoadingDraft(false);
      }
    };
    
    loadDraft();
  }, [draftId, getApplication]);
  
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
  
  const handleSubmitApplication = async (formData: any, status: 'submitted') => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('📋 Form data received:', formData);
      
      // Ensure storage bucket exists
      await ensureStorageBucket();
      
      // Map form data to application schema with submitted status
      const applicationData = mapFormDataToApplication(formData, status);
      
      console.log('📊 Mapped application data:', applicationData);
      
      // Create the application first
      const newApplication = await createApplication(applicationData);
      
      if (newApplication) {
        console.log('✅ Application created successfully:', newApplication);
        
        // Upload documents if any were provided
        try {
          const uploadedDocuments = await uploadApplicationDocuments(newApplication.id, formData);
          console.log(`📎 ${uploadedDocuments.length} documents uploaded successfully`);
        } catch (docError) {
          console.error('⚠️ Document upload failed but application was created:', docError);
          // Don't fail the entire process if document upload fails
        }
        
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

  const handleSaveAsDraft = async (formData: any, status: 'draft', isAutoSave: boolean = false, draftId: string | null = null) => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Validate essential form data
      if (!formData) {
        throw new Error('No form data provided');
      }
      
      // Ensure storage bucket exists
      await ensureStorageBucket();
      
      // Map form data to application schema with draft status
      const applicationData = mapFormDataToApplication(formData, status);
      
      let result;
      
      if (draftId) {
        // Update existing draft
        result = await updateApplication(draftId, applicationData);
      } else {
        // Create new draft
        result = await createApplication(applicationData);
      }
      
      if (result) {
        // Upload documents for drafts too (they can be incomplete)
        try {
          const uploadedDocuments = await uploadApplicationDocuments(result.id, formData);
        } catch (docError) {
          console.error('Document upload failed but draft was saved:', docError);
          // Don't fail draft saving if document upload fails
        }
        
        // Update URL with draft ID if this is a new draft
        if (!draftId && result.id) {
          const newUrl = `/dashboard/new-application?id=${result.id}`;
          router.replace(newUrl); // Use replace to avoid adding to history
          setCurrentApplication(result);
        }
        
        // Only redirect and show success for manual saves, not auto-saves
        if (!isAutoSave) {
          setSuccess(true);
          
          // Redirect to dashboard after a brief success message
          setTimeout(() => {
            router.push("/dashboard?tab=applications&success=draft-saved");
          }, 2000);
        }
        
        // Return the result so component can track the ID
        return result;
      } else {
        throw new Error('Failed to save draft - no result returned from database operation');
      }
    } catch (error) {
      console.error('Error saving draft:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to save draft';
      setError(errorMessage);
      throw error; // Re-throw so auto-save can handle the error
    } finally {
      // Always reset loading state
      setIsLoading(false);
    }
  };
  
  if (loadingDraft) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="max-w-md mx-auto text-center py-12"
          >
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
            <h2 className="font-heading mt-12 scroll-m-28 text-2xl font-medium tracking-tight first:mt-0 lg:mt-20 [&+p]:!mt-4 *:[code]:text-2xl text-blue-900 mb-2">Loading Draft...</h2>
            <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-blue-700 mb-4">
              Please wait while we load your saved application.
            </p>
          </motion.div>
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
            <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-green-700 mb-4">
              Your application has been saved as a draft. You can continue editing or submit it for review.
            </p>
            <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-sm text-muted-foreground">
              Your progress has been saved and you can continue working on your application later.
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
            <h1 className="text-primary leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] lg:font-semibold xl:text-5xl xl:tracking-tighter">
              {draftId ? 'Edit Water Permit Application' : 'New Water Permit Application'}
            </h1>
            <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-muted-foreground mt-2">
              {draftId 
                ? 'Continue editing your water permit application. Your changes are automatically saved.'
                : 'Fill out all required information to apply for your water permit. All fields marked with an asterisk (*) are required.'
              }
            </p>
            {currentApplication && (
              <div className="mt-2 p-2 bg-blue-50 rounded-md">
                <p className="text-sm text-blue-700">
                  📝 Editing draft application • ID: {currentApplication.id.slice(0, 8)}... • 
                  Status: {currentApplication.status} • 
                  Last updated: {new Date(currentApplication.updated_at || currentApplication.created_at).toLocaleString()}
                </p>
              </div>
            )}
          </div>
          
          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {error}
              </AlertDescription>
            </Alert>
          )}
          

          <ApplicationForm 
            userData={userData}
            onSubmit={handleSubmitApplication}
            onSaveAsDraft={(formData, status, isAutoSave = false) => handleSaveAsDraft(formData, status, isAutoSave, draftId)}
            isLoading={isLoading}
            initialData={initialFormData}
            initialDocuments={initialDocuments}
            mode={draftId ? 'edit' : 'create'}
          />
        </motion.div>
      </div>
    </DashboardLayout>
  );
} 