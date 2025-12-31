"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { useRouter, useParams } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { ApplicationForm } from "@/components/dashboard/application-form-new";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, AlertCircle, CheckCircle, Loader2, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useApplications } from "@/hooks/useApplications";
import { useDocuments } from "@/hooks/useDocuments";
import { DocumentViewer } from "@/components/documents/document-viewer";
import { useAuth } from "@/contexts/AuthContext";
import { uploadDocument, getDocumentUrl } from "@/lib/supabase-storage";
import { supabase } from "@/lib/supabase";
import { getApplicationExpiration } from "@/lib/application-expiration";
import type { Application, Document, User as UserType } from "@/types/database";
import { geometryToCoordinatePolygons, polygonsToGeoJSON, type CoordinatePoint } from "@/lib/geoUtils";

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
  // Handle coordinates: support multi-polygons (waterSourcePolygons) and legacy single polygon (waterSourceCoordinates)
  let coordinates: any = undefined;
  try {
    const polys: CoordinatePoint[][] =
      Array.isArray(formData.waterSourcePolygons) && formData.waterSourcePolygons.length > 0
        ? formData.waterSourcePolygons
        : Array.isArray(formData.waterSourceCoordinates)
          ? [formData.waterSourceCoordinates]
          : [];

    const geometry = polygonsToGeoJSON(polys);
    if (geometry) coordinates = geometry.geometry;
  } catch (error) {
    console.warn('Invalid coordinates provided:', error);
  }

  // If polygons are not present/valid, fall back to single abstraction point (LAT/LONG)
  // Stored as GeoJSON Point: [lng, lat]
  if (!coordinates) {
    const latRaw = String(formData.waterSourceLatitude ?? '').trim();
    const lngRaw = String(formData.waterSourceLongitude ?? '').trim();
    if (latRaw && lngRaw) {
      const lat = Number.parseFloat(latRaw);
      const lng = Number.parseFloat(lngRaw);
      const isValidLat = Number.isFinite(lat) && lat >= -90 && lat <= 90;
      const isValidLng = Number.isFinite(lng) && lng >= -180 && lng <= 180;
      if (isValidLat && isValidLng) {
        coordinates = { type: 'Point', coordinates: [lng, lat] };
      }
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
    'fish_farming_lakes': 'agricultural',
    'fish_farming_ponds': 'agricultural',
    'coffee_washing': 'industrial',
    'industry': 'industrial',
    'electricity': 'industrial', // legacy
    'electricity_generation': 'industrial',
    'mining': 'mining_water_use',
    'construction': 'industrial', // legacy
    'construction_of_dam': 'industrial',
    'construction_of_infrastructures': 'industrial',
    'navigation': 'commercial', // navigation is commercial activity
    'recreation': 'commercial', // legacy
    'recreation_activities': 'commercial',
    'other': 'domestic'
  };

  const activityPurposeMap: Record<string, Application['water_purpose']> = {
    'irrigation': 'irrigation',
    'water_supply': 'domestic',
    'aquaculture': 'fish_farming_lakes', // legacy -> migrated enum
    'fish_farming_lakes': 'fish_farming_lakes',
    'fish_farming_ponds': 'fish_farming_ponds',
    'coffee_washing': 'industrial',
    'industry': 'industrial',
    'electricity': 'electricity_generation', // legacy
    'electricity_generation': 'electricity_generation',
    'mining': 'mining',
    'construction': 'industrial', // legacy
    'construction_of_dam': 'industrial',
    'construction_of_infrastructures': 'industrial',
    'navigation': 'recreation', // navigation falls under recreation
    'recreation': 'recreation', // legacy
    'recreation_activities': 'recreation',
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
    return_flow_description: undefined, // Will be filled when form is more complete
    
    // Water source details - map form fields to database fields
    water_body_name: formData.nameSourceWater,
    tributary_name: formData.tributaryToMain,
    
    // Storage facilities - use water supply storage capacity if available
    storage_facilities: formData.waterSupplyStorageCapacity ? 
      `Storage capacity: ${formData.waterSupplyStorageCapacity} m³` : undefined,
    
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

      // Water abstraction point (single point for abstraction activities)
      waterSourceLatitude: formData.waterSourceLatitude,
      waterSourceLongitude: formData.waterSourceLongitude,
      
      // Coordinates are stored in main coordinates field, but save reference
      waterSourceCoordinates: Array.isArray(formData.waterSourceCoordinates)
        ? formData.waterSourceCoordinates
        : Array.isArray(formData.waterSourcePolygons) && formData.waterSourcePolygons[0]
          ? formData.waterSourcePolygons[0]
          : undefined,
      waterSourcePolygons: Array.isArray(formData.waterSourcePolygons)
        ? formData.waterSourcePolygons
        : Array.isArray(formData.waterSourceCoordinates)
          ? [formData.waterSourceCoordinates]
          : undefined,
      
      // Reliability
      waterReliability: formData.waterReliability,
      
      // SECTION 3: INTENDED ACTIVITY
      intendedActivities: formData.intendedActivities,
      intendedActivityOther: formData.intendedActivityOther,
      
      // Water Abstraction
      waterAbstractionDetails: formData.waterAbstractionDetails,
      
      // Water Supply Details (structured fields)
      waterSupplyPopulation: formData.waterSupplyPopulation,
      waterSupplyPerCapitaDemand: formData.waterSupplyPerCapitaDemand,
      waterSupplyTotalDailyDemand: formData.waterSupplyTotalDailyDemand,
      waterSupplyDailyAbstraction: formData.waterSupplyDailyAbstraction,
      waterSupplyStorageCapacity: formData.waterSupplyStorageCapacity,
      
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
      fishLakeNumberOfCages: formData.fishLakeNumberOfCages,
      fishLakeCageCapacity: formData.fishLakeCageCapacity,
      fishLakeConcessionCoordinates: formData.fishLakeConcessionCoordinates,
      fishPondsDiscardWaterQuantityM3PerDay: formData.fishPondsDiscardWaterQuantityM3PerDay,
      
      // Terms & Conditions
      certificationAgreement: formData.certificationAgreement,
      
      // Document fields (file references - actual files are stored separately)
      technicalDrawings: formData.technicalDrawings,
      environmentalImpactDoc: formData.environmentalImpactDoc || 
                             formData.irrigationEIA || 
                             formData.aquacultureEIA || 
                             formData.hydropowerEIA ||
                             formData.miningEIA,
      feasibilityStudy: formData.feasibilityStudy || 
                        formData.irrigationFeasibilityStudy || 
                        formData.waterSupplyFeasibilityStudy || 
                        formData.hydropowerFeasibilityStudy ||
                        formData.aquacultureFeasibilityStudy ||
                        formData.miningFeasibilityStudy,
      generalRequirements: formData.generalRequirements ||
                          formData.irrigationGeneralRequirements ||
                          formData.waterSupplyGeneralRequirements ||
                          formData.aquacultureGeneralRequirements ||
                          formData.hydropowerGeneralRequirements ||
                          formData.miningGeneralRequirements,
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
      },
      
      // Additional documents uploaded by user
      additionalDocuments: formData.additionalDocuments || []
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
    
    // Ensure polygons are properly formatted (back-compat with legacy waterSourceCoordinates)
    if (Array.isArray(formData.waterSourcePolygons) && formData.waterSourcePolygons.length > 0) {
      // ok
    } else if (Array.isArray(formData.waterSourceCoordinates)) {
      formData.waterSourcePolygons = [formData.waterSourceCoordinates];
    } else {
      formData.waterSourcePolygons = [
        [
          { latitude: "", longitude: "" },
          { latitude: "", longitude: "" },
          { latitude: "", longitude: "" }
        ]
      ];
    }
    
    // Ensure additionalDocuments is always an array
    if (!formData.additionalDocuments) {
      formData.additionalDocuments = [];
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
  formData.nameSourceWater = application.water_body_name || '';
  formData.tributaryToMain = application.tributary_name || '';
  
  // Water source location (same as office for now) - reverse the province mapping
  formData.waterSourceProvince = provinceReverseMap[application.province] || application.province || '';
  formData.waterSourceDistrict = application.district || '';
  formData.waterSourceSector = application.sector || '';
  formData.waterSourceCell = application.cell || '';
  formData.waterSourceVillage = application.village || '';

  // Coordinates - normalize Polygon/MultiPolygon/Point into waterSourcePolygons
  try {
    const polys = geometryToCoordinatePolygons(application.coordinates);
    formData.waterSourcePolygons =
      polys && polys.length > 0
        ? polys
        : [
            [
              { latitude: "", longitude: "" },
              { latitude: "", longitude: "" },
              { latitude: "", longitude: "" }
            ]
          ];
  } catch (error) {
    console.warn('Error parsing coordinates:', error);
    formData.waterSourcePolygons = [
      [
        { latitude: "", longitude: "" },
        { latitude: "", longitude: "" },
        { latitude: "", longitude: "" }
      ]
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
    'aquaculture': 'fish_farming_lakes', // legacy
    'fish_farming_lakes': 'fish_farming_lakes',
    'fish_farming_ponds': 'fish_farming_ponds',
    'industrial': 'industry',
    'electricity_generation': 'electricity_generation',
    'mining': 'mining',
    'recreation': 'recreation_activities'
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

  // Ensure additionalDocuments is always an array for legacy format too
  if (!formData.additionalDocuments) {
    formData.additionalDocuments = [];
  }

  return formData;
}

// Helper function to upload documents and save to database
async function uploadApplicationDocuments(applicationId: string, formData: any, userId?: string): Promise<Document[]> {
  try {
    const uploadedDocuments: Document[] = [];
    
    // Document type mapping
    const documentTypes = {
      paymentProof: 'payment_proof',
      identificationDoc: 'identification_doc', 
      landOwnershipDoc: 'land_ownership_doc',
      landAccessDocuments: 'land_access_doc',
      technicalDrawings: 'technical_drawings',
      environmentalImpactDoc: 'environmental_impact_doc',
      intakeDischargeMap: 'intake_discharge_map',
      feasibilityStudy: 'other',
      miningLicense: 'business_license',
      miningEIA: 'environmental_impact_doc',
      miningHydrologicalReport: 'geological_survey',
      miningGeneralRequirements: 'other',
      // Irrigation documents
      irrigationGeneralRequirements: 'other',
      irrigationEIA: 'environmental_impact_doc',
      irrigationFeasibilityStudy: 'other',
      // Water Supply documents
      waterSupplyGeneralRequirements: 'other',
      waterSupplyFeasibilityStudy: 'other',
      // Aquaculture documents
      aquacultureGeneralRequirements: 'other',
      aquacultureEIA: 'environmental_impact_doc',
      aquacultureManagementPlan: 'other',
      aquacultureRecommendationLetter: 'other',
      // Coffee Washing documents
      coffeeWashingGeneralRequirements: 'other',
      coffeeWashingEIA: 'environmental_impact_doc',
      // Industrial documents
      industrialGeneralRequirements: 'other',
      industrialEIA: 'environmental_impact_doc',
      // Hydropower documents
      hydropowerGeneralRequirements: 'other',
      hydropowerEIA: 'environmental_impact_doc',
      // Construction Dam documents
      constructionDamGeneralRequirements: 'other',
      constructionDamEIA: 'environmental_impact_doc',
      // Infrastructure documents
      infrastructureGeneralRequirements: 'other',
      infrastructureEIA: 'environmental_impact_doc',
      // Navigation documents
      navigationGeneralRequirements: 'other',
      navigationEIA: 'environmental_impact_doc',
      // Recreation documents
      recreationGeneralRequirements: 'other',
      recreationEIA: 'environmental_impact_doc'
    };
    
    console.log('📋 Checking for document uploads in formData:', Object.keys(formData).filter(key => formData[key] instanceof File));
    console.log('📋 All formData keys:', Object.keys(formData));
    console.log('📋 FormData file entries:', Object.entries(formData).filter(([key, value]) => value instanceof File));
    
    for (const [fieldName, documentType] of Object.entries(documentTypes)) {
      const file = formData[fieldName];
      
      if (file && file instanceof File) {
        console.log(`📎 Found file for ${fieldName}:`, file.name);
        try {
          // Upload file to storage
          console.log(`🔄 Uploading ${fieldName} to storage...`);
          const uploadResult = await uploadDocument(file, applicationId, fieldName);
          console.log(`✅ Upload result for ${fieldName}:`, uploadResult);
          
          if (uploadResult) {
            // Check if document already exists
            const { data: existingDoc, error: checkError } = await supabase
              .from('documents')
              .select('id')
              .eq('application_id', applicationId)
              .eq('type', documentType)
              .maybeSingle();
              
            if (checkError && checkError.code !== 'PGRST116') {
              console.error(`Error checking existing document ${fieldName}:`, checkError);
              continue;
            }
            
            if (existingDoc) {
              // Update existing document
              const { data: documentRecord, error: dbError } = await supabase
                .from('documents')
                .update({
                  name: file.name,
                  file_path: uploadResult.path,
                  file_size: file.size,
                  mime_type: file.type,
                  verification_status: 'pending',
                  updated_at: new Date().toISOString()
                })
                .eq('id', existingDoc.id)
                .select()
                .single();
                
              if (dbError) {
                console.error(`❌ Error updating document ${fieldName}:`, {
                  fieldName,
                  documentType,
                  error: dbError,
                  errorMessage: dbError.message,
                  errorCode: dbError.code,
                  errorDetails: dbError.details,
                  errorHint: dbError.hint
                });
              } else {
                console.log(`✅ Updated existing document ${fieldName} successfully`);
                uploadedDocuments.push(documentRecord);
              }
            } else {
              // Create new document record
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
                  is_required: [
                    'paymentProof', 
                    'identificationDoc', 
                    'landAccessDocuments',
                    'landOwnershipDoc',
                    'miningGeneralRequirements',
                    'miningLicense',
                    'miningEIA',
                    'miningHydrologicalReport'
                  ].includes(fieldName),
                  uploaded_by: userId || '550e8400-e29b-41d4-a716-446655440001',
                  upload_date: new Date().toISOString()
                })
                .select()
                .single();
                
              if (dbError) {
                console.error(`❌ Error saving document ${fieldName} to database:`, {
                  fieldName,
                  documentType,
                  error: dbError,
                  errorMessage: dbError.message,
                  errorCode: dbError.code,
                  errorDetails: dbError.details,
                  errorHint: dbError.hint
                });
              } else {
                console.log(`✅ Created new document ${fieldName} successfully`);
                uploadedDocuments.push(documentRecord);
              }
            }
          } else {
            console.error(`Failed to upload ${fieldName}`);
          }
        } catch (error) {
          console.error(`Error processing document ${fieldName}:`, error);
        }
      }
    }
    
    // Handle additional documents
    if (formData.additionalDocuments && Array.isArray(formData.additionalDocuments)) {
      console.log('📎 Processing additional documents:', formData.additionalDocuments.length);
      
      for (const additionalDoc of formData.additionalDocuments) {
        if (additionalDoc.file && additionalDoc.file instanceof File) {
          console.log(`📎 Found additional document file:`, additionalDoc.file.name);
          try {
            // Upload file to storage with a unique field name
            const fieldName = `additional_${additionalDoc.id}`;
            console.log(`🔄 Uploading additional document ${additionalDoc.name} to storage...`);
            const uploadResult = await uploadDocument(additionalDoc.file, applicationId, fieldName);
            console.log(`✅ Upload result for additional document ${additionalDoc.name}:`, uploadResult);
            
            if (uploadResult) {
              // Check if document already exists
              const { data: existingDoc, error: checkError } = await supabase
                .from('documents')
                .select('id')
                .eq('application_id', applicationId)
                .eq('name', additionalDoc.name)
                .eq('type', 'other')
                .maybeSingle();
                
              if (checkError && checkError.code !== 'PGRST116') {
                console.error(`Error checking existing additional document ${additionalDoc.name}:`, checkError);
                continue;
              }
              
              if (existingDoc) {
                // Update existing document
                const { data: documentRecord, error: dbError } = await supabase
                  .from('documents')
                  .update({
                    name: additionalDoc.name,
                    file_path: uploadResult.path,
                    file_size: additionalDoc.file.size,
                    mime_type: additionalDoc.file.type,
                    verification_status: 'pending' as const,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', existingDoc.id)
                  .select()
                  .single();
                  
                if (dbError) {
                  console.error(`Error updating additional document ${additionalDoc.name}:`, dbError);
                } else {
                  uploadedDocuments.push(documentRecord);
                }
              } else {
                // Create new document record
                const { data: documentRecord, error: dbError } = await supabase
                  .from('documents')
                  .insert({
                    application_id: applicationId,
                    name: additionalDoc.name,
                    type: 'other' as const,
                    file_path: uploadResult.path,
                    file_size: additionalDoc.file.size,
                    mime_type: additionalDoc.file.type,
                    verification_status: 'pending' as const,
                    is_required: false,
                    uploaded_by: userId || '550e8400-e29b-41d4-a716-446655440001',
                    upload_date: new Date().toISOString()
                  })
                  .select()
                  .single();
                  
                if (dbError) {
                  console.error(`Error saving additional document ${additionalDoc.name} to database:`, dbError);
                } else {
                  uploadedDocuments.push(documentRecord);
                }
              }
            } else {
              console.error(`Failed to upload additional document ${additionalDoc.name}`);
            }
          } catch (error) {
            console.error(`Error processing additional document ${additionalDoc.name}:`, error);
          }
        }
      }
    }
    
    console.log(`📋 Total documents processed: ${uploadedDocuments.length}`);
    return uploadedDocuments;
  } catch (error) {
    console.error('Error uploading documents:', error);
    throw error;
  }
}

export default function EditApplicationPage() {
  const router = useRouter();
  const params = useParams();
  const { userProfile } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [application, setApplication] = useState<ApplicationWithRelations | null>(null);
  const [initialFormData, setInitialFormData] = useState<any>(null);
  const [initialDocuments, setInitialDocuments] = useState<Record<string, { url: string; name: string }>>({});
  const [loadingApplication, setLoadingApplication] = useState(true);
  const [isExpired, setIsExpired] = useState(false);
  const [expiresAtIso, setExpiresAtIso] = useState<string | null>(null);
  
  const { getApplication, updateApplication } = useApplications({
    userId: userProfile?.id,
    autoFetch: false // Don't auto-fetch all applications, we only need one
  });
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
        console.log('Current user profile:', userProfile);
        console.log('Current user ID:', userProfile?.id);
        
        const app = await getApplication(applicationId);
        if (app) {
          // Determine whether a permit has been issued (permits row exists) and apply expiry rule.
          const { data: permitRow } = await supabase
            .from('permits')
            .select('id')
            .eq('application_id', app.id)
            .limit(1)
            .maybeSingle();

          const expiration = getApplicationExpiration({
            submitted_at: (app as any).submitted_at ?? null,
            hasPermit: Boolean(permitRow?.id),
          });

          if (expiration.isExpired) {
            setIsExpired(true);
            setExpiresAtIso(expiration.expiresAt ? expiration.expiresAt.toISOString() : null);

            // Best-effort: mark the application as expired in DB (requires enum + policies).
            try {
              await supabase
                .from('applications')
                .update({ status: 'expired' as any, updated_at: new Date().toISOString() })
                .eq('id', app.id);
            } catch (e) {
              console.warn('⚠️ Failed to set status=expired (best-effort).', e);
            }
          } else {
            setIsExpired(false);
            setExpiresAtIso(null);
          }

          // Check if application is editable - approved or rejected applications cannot be edited by anyone
          if (app.status === 'approved' || app.status === 'rejected') {
            setError('Approved or rejected applications cannot be edited. Please contact an administrator if changes are needed.');
            return;
          }
          
          // Expired applications are view-only.
          if (app.status === 'expired' || expiration.isExpired) {
            setError('⛔ This application has expired (6 months since submission) and can no longer be edited or submitted.');
          }

          // Check if application is editable (draft or revision_required status), unless expired (view-only)
          if (!expiration.isExpired && app.status !== 'draft' && app.status !== 'revision_required') {
            setError('Only draft applications and applications returned for revision can be edited');
            return;
          }
          
          setApplication(expiration.isExpired ? ({ ...(app as any), status: 'expired' } as any) : app);
          
          // ⚡ PERFORMANCE: Load application and documents in parallel
          const [formData, documents] = await Promise.all([
            Promise.resolve(mapApplicationToFormData(app, userProfile)),
            getDocuments(app.id)
          ]);
          
          setInitialFormData(formData);
          
          // ⚡ PERFORMANCE: Process documents efficiently
          const documentMap: Record<string, { url: string; name: string }> = {};
          const additionalDocsList: any[] = [];
          
          const typeMapping: Record<string, string> = {
            'identification_doc': 'identificationDoc',
            'land_ownership_doc': 'landOwnershipDoc',
            'land_access_doc': 'landAccessDocuments',
            'technical_drawings': 'technicalDrawings',
            'environmental_impact_doc': 'environmentalImpactDoc',
            'payment_proof': 'paymentProof',
            'intake_discharge_map': 'intakeDischargeMap',
            'business_license': 'miningLicense',
            'geological_survey': 'miningHydrologicalReport',
            'water_quality_report': 'waterQualityReport'
          };

          // Create reverse mapping to find field names from documents
          const documentTypeToField: Record<string, string[]> = {
            'other': [] // Will be populated with activity-specific documents
          };
          
          // Smart document classification based on file path patterns
          for (const doc of documents) {
            if (doc.file_path && doc.name) {
              const publicUrl = getDocumentUrl(doc.file_path);
              if (publicUrl) {
                console.log(`📋 Processing document: ${doc.name} (type: ${doc.type}, path: ${doc.file_path})`);
                
                // Extract field name from file path if it follows our naming convention
                const pathParts = doc.file_path.split('/');
                const fileName = pathParts[pathParts.length - 1];
                const fieldNameMatch = fileName.match(/^([a-zA-Z]+(?:[A-Z][a-zA-Z]*)*)-\d+\./);
                
                if (fieldNameMatch) {
                  // This is a structured document with field name in path
                  const fieldName = fieldNameMatch[1];
                  console.log(`📋 Identified field name from path: ${fieldName}`);
                  
                  // Check if it's an additional document
                  if (fieldName.startsWith('additional_')) {
                    additionalDocsList.push({
                      id: doc.id || `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                      name: doc.name,
                      category: 'additional',
                      description: (doc as any).description || '',
                      file: null,
                      url: publicUrl
                    });
                  } else {
                    // This is a standard/activity-specific document
                    documentMap[fieldName] = {
                      url: publicUrl,
                      name: doc.name
                    };
                  }
                } else {
                  // Fallback to old logic for documents without structured naming
                  const isStandardDoc = Object.keys(typeMapping).includes(doc.type) && 
                                      doc.type !== 'other';
                  
                  if (!isStandardDoc && doc.type === 'other') {
                    // This is likely an additional document
                    additionalDocsList.push({
                      id: doc.id || `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                      name: doc.name,
                      category: 'additional',
                      description: (doc as any).description || '',
                      file: null,
                      url: publicUrl
                    });
                  } else {
                    // This is a standard document
                    const fieldName = typeMapping[doc.type] || doc.type;
                    documentMap[fieldName] = {
                      url: publicUrl,
                      name: doc.name
                    };
                  }
                }
              }
            }
          }
          
          // Add additional documents to form data
          if (additionalDocsList.length > 0) {
            formData.additionalDocuments = additionalDocsList;
          }
          
          setInitialDocuments(documentMap);
          console.log('📋 Document processing complete:');
          console.log('📋 Standard documents found:', Object.keys(documentMap));
          console.log('📋 Additional documents found:', additionalDocsList.length);
          console.log('📋 Additional documents:', additionalDocsList);
          console.log('✅ Application loaded for editing:', app);
          console.log('✅ Form data mapped:', formData);
        } else {
          console.log('❌ Application not found for ID:', applicationId);
          setError('Application not found. This may be because the application doesn\'t exist, you don\'t have permission to edit it, or it belongs to another user.');
        }
      } catch (err) {
        console.error('❌ Error loading application:', err);
        console.error('❌ Error details:', err);
        setError(`Failed to load application: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setLoadingApplication(false);
      }
    };
    
    if (params.id && userProfile?.id) {
      fetchApplication();
    }
  }, [params.id, getApplication, userProfile?.id]);
  
  const handleSubmitApplication = async (formData: any, status: 'submitted') => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('Updating application, form data received:', formData);
      console.log('Current application state at submit:', application);
      console.log('Application ID at submit:', application?.id);
      
      // Map form data to application schema with submitted status
      const applicationData = mapFormDataToApplication(formData, status, userProfile?.id);
      
      console.log('Mapped application data:', applicationData);
      
      // Check if application exists
      if (!application?.id) {
        console.error('❌ Application is null or missing ID at submit time');
        console.error('Application state:', application);
        throw new Error('Application not found or missing ID');
      }
      
      // Update the application
      const updatedApplication = await updateApplication(application.id, applicationData);
      
      if (updatedApplication) {
        console.log('✅ Application updated and submitted successfully:', updatedApplication);

        // Fire-and-forget: send submission SMS + email (idempotent server-side)
        try {
          fetch('/api/notifications/send-submission', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ applicationId: updatedApplication.id }),
          }).catch(() => null)
        } catch {}
        
        // Upload documents in background, don't block UI
        console.log('🚀 Starting document upload process...');
        uploadApplicationDocuments(application.id, formData, userProfile?.id)
          .then(uploadedDocuments => {
            console.log(`📎 ${uploadedDocuments.length} documents uploaded successfully`);
          })
          .catch(docError => {
            console.error('⚠️ Document upload failed but application was updated:', docError);
            console.error('⚠️ Full error details:', docError);
          });
        
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
      setDraftSaved(false);
      
      console.log('Updating draft, form data received:', formData);
      console.log('Current application state:', application);
      console.log('Application ID:', application?.id);
      console.log('User profile ID:', userProfile?.id);
      
      // Map form data to application schema with draft status
      const applicationData = mapFormDataToApplication(formData, status, userProfile?.id);
      // Never attempt to update ownership fields from the client (can violate RLS/policies)
      const { applicant_id, ...updateData } = applicationData as any;
      
      console.log('Mapped draft application data:', updateData);
      
      // Check if application exists
      if (!application?.id) {
        console.error('❌ Application is null or missing ID at save time');
        console.error('Application state:', application);
        throw new Error('Application not found or missing ID');
      }
      
      // Update the application as draft
      const updatedApplication = await updateApplication(application.id, updateData);

      if (updatedApplication) {
        console.log('✅ Application updated as draft successfully:', updatedApplication);
        
        // Upload documents in background, don't block UI
        console.log('🚀 Starting document upload process for draft...');
        uploadApplicationDocuments(application.id, formData, userProfile?.id)
          .then(uploadedDocuments => {
            console.log(`📎 ${uploadedDocuments.length} documents uploaded successfully`);
          })
          .catch(docError => {
            console.error('⚠️ Document upload failed but draft was saved:', docError);
            console.error('⚠️ Full error details:', docError);
          });
        
        // ✅ Draft save UX (do NOT redirect; payment flow depends on staying here)
        setDraftSaved(true);
        setTimeout(() => setDraftSaved(false), 2000);

        return updatedApplication;
      } else {
        // If updateApplication returned null, it has already set a more specific error in the hook.
        throw new Error('Failed to save draft');
      }
    } catch (error) {
      console.error('❌ Error saving draft:', error);
      setError(error instanceof Error ? error.message : 'Failed to save draft');
    } finally {
      // Always reset loading state
      setIsLoading(false);
    }
  }, [application, updateApplication, userProfile?.id, router]);
  
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
          {(isLoading || draftSaved) && (
            <Alert className={draftSaved ? "border-green-200 bg-green-50" : "border-blue-200 bg-blue-50"}>
              {draftSaved ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
              )}
              <AlertDescription className={draftSaved ? "text-green-800" : "text-blue-800"}>
                {draftSaved ? "✅ Draft saved." : "Saving draft…"}
              </AlertDescription>
            </Alert>
          )}
          <div>
            <h1 className="text-primary leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] lg:font-semibold xl:text-5xl xl:tracking-tighter">Edit Water Permit Application</h1>
            <p className="text-muted-foreground mt-2">
              {isExpired
                ? 'This application has expired and is now view-only.'
                : 'Update your draft application below. You can save changes as a draft or submit for review.'}
            </p>
          </div>

          {/* Expired Notice */}
          {isExpired && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mb-6"
            >
              <Alert className="border-slate-300 bg-gradient-to-r from-slate-50 to-slate-100 shadow-sm">
                <AlertCircle className="h-5 w-5 text-slate-700" />
                <AlertDescription>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900 text-lg">⛔ Application Expired</h3>
                      <Badge className="border border-slate-300 text-slate-700 bg-slate-200">
                        Expired
                      </Badge>
                    </div>
                    <p className="text-slate-800">
                      This application expired 6 months after submission and can no longer be edited or submitted.
                    </p>
                    {expiresAtIso && (
                      <p className="text-sm text-slate-700">
                        Expired on: <span className="font-medium">{new Date(expiresAtIso).toLocaleDateString()}</span>
                      </p>
                    )}
                    <p className="text-sm text-slate-700">
                      You can still view the submitted information and documents below.
                    </p>
                  </div>
                </AlertDescription>
              </Alert>
            </motion.div>
          )}

          {/* Revision Requirements - Prominent Notice */}
          {application?.status === 'revision_required' && application.revision_notes && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mb-6"
            >
              <Alert className="border-orange-300 bg-gradient-to-r from-orange-50 to-amber-50 shadow-md">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
                <AlertDescription>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-orange-900 text-lg">⚠️ Revision Required</h3>
                      <Badge className="border border-orange-300 text-orange-700 bg-orange-100">
                        Action Needed
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <p className="font-medium text-orange-800">Required Changes:</p>
                      <div className="bg-white/50 rounded-md p-3 border border-orange-200">
                        <p className="text-orange-900 leading-relaxed whitespace-pre-wrap">{application.revision_notes}</p>
                      </div>
                      <p className="text-sm text-orange-700 mt-2">
                        <strong>Note:</strong> Please review the specific requirements above and make the necessary changes before resubmitting your application.
                      </p>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            </motion.div>
          )}

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
              mode={isExpired ? "view" : "edit"}
              readOnly={isExpired}
              currentApplication={application}
            />
          )}
        </motion.div>
      </div>
    </DashboardLayout>
  );
} 