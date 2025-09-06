"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { useRouter, useParams } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { ApplicationForm } from "@/components/dashboard/application-form-new";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { useApplications } from "@/hooks/useApplications";
import { useDocuments } from "@/hooks/useDocuments";
import { DocumentViewer } from "@/components/documents/document-viewer";
import { useAuth } from "@/contexts/AuthContext";
import { uploadDocument, getDocumentUrl } from "@/lib/supabase-storage";
import { supabase } from "@/lib/supabase";
import type { Application, Document, User as UserType } from "@/types/database";

interface ApplicationWithRelations extends Application {
  applicant?: UserType;
  documents?: Document[];
}

// Helper function to map Rwanda administrative data province names to database enum
function formatProvinceForDB(province: string): Application['province'] | undefined {
  if (!province) return undefined;
  const provinceMap: Record<string, Application['province']> = {
    'Kigali': 'Kigali',
    'North': 'Northern', 
    'South': 'Southern',
    'East': 'Eastern',
    'West': 'Western'
  };
  return provinceMap[province] || provinceMap[province.toLowerCase()] || undefined;
}

// Mapping function to transform form data to database schema - UPDATED TO MATCH NEW-APPLICATION
function mapFormDataToApplication(formData: any, status: 'draft' | 'submitted' = 'draft', userId?: string): Partial<Application> {
  // Handle coordinates - now expecting 5 points for a polygon
  let coordinates = undefined;
  if (formData.waterSourceCoordinates && Array.isArray(formData.waterSourceCoordinates)) {
    try {
      const validCoordinates = formData.waterSourceCoordinates
        .filter((coord: any) => coord.latitude && coord.longitude)
        .map((coord: any) => {
          const lat = parseFloat(coord.latitude);
          const lon = parseFloat(coord.longitude);
          if (!isNaN(lat) && !isNaN(lon)) {
            return [lon, lat]; // GeoJSON uses [longitude, latitude] order
          }
          return null;
        })
        .filter((coord: any) => coord !== null);

      if (validCoordinates.length === 5) {
        // Ensure the polygon is closed by making the last point same as first if needed
        const firstPoint = validCoordinates[0];
        const lastPoint = validCoordinates[4];
        if (firstPoint[0] !== lastPoint[0] || firstPoint[1] !== lastPoint[1]) {
          validCoordinates.push(firstPoint); // Close the polygon
        }
        
        // Store as GeoJSON polygon for PostGIS compatibility
        coordinates = {
          type: 'Polygon',
          coordinates: [validCoordinates] // Polygon requires array of linear rings
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
    district: formData.officeDistrict || (status === 'draft' ? 'Draft District' : ''),
    sector: formData.officeSector || (status === 'draft' ? 'Draft Sector' : ''), 
    cell: formData.officeCell || (status === 'draft' ? 'Draft Cell' : ''),
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
    
    // Location details - use actual form data or defaults for drafts  
    province: formatProvinceForDB(formData.officeProvince) || defaultsForDrafts.province,
    district: formData.officeDistrict || defaultsForDrafts.district,
    sector: formData.officeSector || defaultsForDrafts.sector,
    cell: formData.officeCell || defaultsForDrafts.cell,
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
    
    // Comprehensive form data stored in internal_notes as structured JSON for complete retrieval
    internal_notes: JSON.stringify({
      // Debug: Log what we're storing
      _debug: {
        timestamp: new Date().toISOString(),
        nameSourceWater: formData.nameSourceWater || 'EMPTY',
        tributaryToMain: formData.tributaryToMain || 'EMPTY'
      },
      // SECTION 1: IDENTIFICATION AND ADDRESS OF THE APPLICANT
      fullNameApplicant: formData.fullNameApplicant,
      categoryApplicant: formData.categoryApplicant,
      categoryApplicantOther: formData.categoryApplicantOther,
      nameRepresentative: formData.nameRepresentative,
      
      // Office Address
      officeProvince: formData.officeProvince,
      officeDistrict: formData.officeDistrict,
      officeSector: formData.officeSector,
      officeCell: formData.officeCell,
      officeVillage: formData.officeVillage,
      officeCountry: formData.officeCountry,
      officePostalAddress: formData.officePostalAddress,
      
      // Contact Information
      telephoneContact: formData.telephoneContact,
      telephoneContactOffice: formData.telephoneContactOffice,
      emailAddress: formData.emailAddress,
      nationalIdNumber: formData.nationalIdNumber,
      
      // SECTION 2: SOURCE OF WATER
      waterSourceType: formData.waterSourceType,
      waterSourceOther: formData.waterSourceOther,
      nameSourceWater: formData.nameSourceWater,
      tributaryToMain: formData.tributaryToMain,
      
      // Water source location
      waterSourceProvince: formData.waterSourceProvince,
      waterSourceDistrict: formData.waterSourceDistrict,
      waterSourceSector: formData.waterSourceSector,
      waterSourceCell: formData.waterSourceCell,
      waterSourceVillage: formData.waterSourceVillage,
      
      // Coordinates are stored in main coordinates field, but save reference
      waterSourceCoordinates: formData.waterSourceCoordinates,
      
      // Reliability
      waterReliability: formData.waterReliability,
      
      // SECTION 3: INTENDED ACTIVITY
      intendedActivities: formData.intendedActivities,
      intendedActivityOther: formData.intendedActivityOther,
      
      // Water Abstraction
      waterAbstractionDetails: formData.waterAbstractionDetails,
      
      // Water Concession (for Aquaculture)
      concessionArea: formData.concessionArea,
      concessionAreaUnit: formData.concessionAreaUnit,
      permitPeriod: formData.permitPeriod,
      
      // SECTION 4: OWNERSHIP OF ADJOINING LAND
      ownsAllLand: formData.ownsAllLand,
      hasLandAccess: formData.hasLandAccess,
      
      // ANNEXES - All annex details
      annexA_irrigationDetails: formData.annexA_irrigationDetails,
      annexB_waterSupplyDetails: formData.annexB_waterSupplyDetails,
      annexC_aquacultureDetails: formData.annexC_aquacultureDetails,
      annexD_coffeeWashingDetails: formData.annexD_coffeeWashingDetails,
      annexE_industryDetails: formData.annexE_industryDetails,
      annexF_electricityDetails: formData.annexF_electricityDetails,
      annexG_miningDetails: formData.annexG_miningDetails,
      annexH_constructionDetails: formData.annexH_constructionDetails,
      annexI_navigationDetails: formData.annexI_navigationDetails,
      annexJ_recreationDetails: formData.annexJ_recreationDetails,
      annexK_otherDetails: formData.annexK_otherDetails,
      
      // Mining structured fields
      miningQuantityPerDay: formData.miningQuantityPerDay,
      miningQuantityPerMonth: formData.miningQuantityPerMonth,
      miningMineralsType: formData.miningMineralsType,
      miningProductionCapacityTonsPerYear: formData.miningProductionCapacityTonsPerYear,
      
      // Fish farming fields
      fishLakeAreaHectares: formData.fishLakeAreaHectares,
      fishPondsDiscardWaterQuantityM3PerDay: formData.fishPondsDiscardWaterQuantityM3PerDay,
      
      // Terms & Conditions
      certificationAgreement: formData.certificationAgreement,
      
      // Document fields (file references - actual files are stored separately)
      technicalDrawings: formData.technicalDrawings,
      environmentalImpactDoc: formData.environmentalImpactDoc,
      feasibilityStudy: formData.feasibilityStudy,
      miningLicense: formData.miningLicense,
      miningEIA: formData.miningEIA,
      miningHydrologicalReport: formData.miningHydrologicalReport,
      miningGeneralRequirements: formData.miningGeneralRequirements,
      
      // Metadata for legacy compatibility
      _legacy: {
        category: formData.categoryApplicant,
        activities: formData.intendedActivities?.join(', ') || 'Not specified',
        waterSource: formData.waterSourceType || 'Not specified',
        contact: formData.emailAddress || 'Not provided'
      }
    }),
    
    // SLA tracking
    sla_status: 'on_time' as const,
    
    // Use the actual authenticated user's ID
    applicant_id: userId || '550e8400-e29b-41d4-a716-446655440001', // Fallback to sample ID for development
  };

  return mappedData;
}

// Transform Application data back to form format for editing - UPDATED TO MATCH NEW-APPLICATION
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
    
    // Debug: Log specific fields being restored
    console.log('🔍 Key fields restored:', {
      nameSourceWater: formData.nameSourceWater,
      tributaryToMain: formData.tributaryToMain,
      waterSourceType: formData.waterSourceType,
      fullNameApplicant: formData.fullNameApplicant
    });
    
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
    
    return formData; // Early return for new format
  }
  
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
  formData.nameSourceWater = ''; // Will be filled by user
  formData.tributaryToMain = ''; // Will be filled by user
  
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

  return formData;
}

export default function EditApplicationPage() {
  const router = useRouter();
  const params = useParams();
  const { userProfile } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [application, setApplication] = useState<ApplicationWithRelations | null>(null);
  const [initialFormData, setInitialFormData] = useState<any>(null);
  const [initialDocuments, setInitialDocuments] = useState<Record<string, { url: string; name: string }>>({});
  const [loadingApplication, setLoadingApplication] = useState(true);
  
  const { getApplication, updateApplication } = useApplications();
  const { getDocuments } = useDocuments();
  
  // ⚡ PERFORMANCE: Memoize user data to prevent re-renders
  const userData = useMemo(() => {
    if (!userProfile) {
      return {
        email: "",
        name: "",
        phone: "",
        address: "",
        idNumber: "",
    account_type: 'individual' as const,
        id_number: "",
    company_tin: undefined,
  };
    }
    
    return {
      email: userProfile.email || "",
      name: `${userProfile.first_name || ''} ${userProfile.last_name || ''}`.trim() || userProfile.company_name || "",
      phone: userProfile.phone || userProfile.company_phone || "",
      address: userProfile.company_address || "",
      idNumber: userProfile.id_number || "",
      account_type: userProfile.account_type || 'individual' as const,
      id_number: userProfile.id_number || "",
      company_tin: userProfile.company_tin,
    };
  }, [userProfile]);

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
          
          // ⚡ PERFORMANCE: Load application and documents in parallel
          const [formData, documents] = await Promise.all([
            Promise.resolve(mapApplicationToFormData(app, userProfile)),
            getDocuments(app.id)
          ]);
          
          setInitialFormData(formData);
          
          // ⚡ PERFORMANCE: Process documents efficiently
          const documentMap: Record<string, { url: string; name: string }> = {};
          const typeMapping: Record<string, string> = {
            'identification_doc': 'identificationDoc',
            'land_ownership_doc': 'landOwnershipDoc', 
            'technical_drawings': 'technicalDrawings',
            'environmental_impact_doc': 'environmentalImpactDoc',
            'payment_proof': 'paymentProof',
            'intake_discharge_map': 'intakeDischargeMap'
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
      const applicationData = mapFormDataToApplication(formData, status, userProfile?.id);
      
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

  const handleSaveAsDraft = useCallback(async (formData: any, status: 'draft') => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('Updating draft, form data received:', formData);
      
      // Map form data to application schema with draft status
      const applicationData = mapFormDataToApplication(formData, status, userProfile?.id);
      
      console.log('Mapped draft application data:', applicationData);
      
      // Update the application as draft
      const updatedApplication = await updateApplication(application!.id, applicationData);
      
      if (updatedApplication) {
        console.log('✅ Application updated as draft successfully:', updatedApplication);
        
        // Always show success for manual saves
          setSuccess(true);
          
          // Redirect to dashboard after a brief success message
          setTimeout(() => {
            router.push("/dashboard?tab=applications&success=draft-updated");
        }, 1500);
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
  }, [updateApplication, userProfile?.id, router]);
  
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
              initialDocuments={initialDocuments}
              mode="edit"
            />
          )}
        </motion.div>
      </div>
    </DashboardLayout>
  );
} 