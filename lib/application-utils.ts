import type { Application } from '@/types/database';
import { polygonsToGeoJSON, type CoordinatePoint } from '@/lib/geoUtils';

// Helper function to map Rwanda administrative data province names to database enum
export function formatProvinceForDB(province: string): Application['province'] | undefined {
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

// Mapping function to transform form data to database schema
export function mapFormDataToApplication(formData: any, status: 'draft' | 'submitted' = 'draft', userId?: string): Partial<Application> {
  // Handle coordinates: support single polygon (legacy waterSourceCoordinates) and multi-polygons (waterSourcePolygons)
  let coordinates: any = undefined;
  try {
    const polygons: CoordinatePoint[][] =
      Array.isArray(formData.waterSourcePolygons) && formData.waterSourcePolygons.length > 0
        ? formData.waterSourcePolygons
        : Array.isArray(formData.waterSourceCoordinates)
          ? [formData.waterSourceCoordinates]
          : [];

    const geometry = polygonsToGeoJSON(polygons);
    if (geometry) {
      // Store GeoJSON geometry for PostGIS compatibility
      coordinates = geometry.geometry;
    }
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
  // Only use defaults when the actual form data is truly empty
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
    // When creating a submitted application directly (non-payment flows), stamp submission time.
    ...(status === 'submitted' ? { submitted_at: new Date().toISOString() } : {}),
    
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
      
      // Irrigation structured fields
      irrigationCropType: formData.irrigationCropType,
      irrigationGrowingSeasonFrom: formData.irrigationGrowingSeasonFrom,
      irrigationGrowingSeasonTo: formData.irrigationGrowingSeasonTo,
      irrigationProductionSystem: formData.irrigationProductionSystem,
      irrigationMethod: formData.irrigationMethod,
      irrigationTotalArea: formData.irrigationTotalArea,
      irrigationWaterDemand: formData.irrigationWaterDemand,
      irrigationStorageFacilities: formData.irrigationStorageFacilities,
      irrigationStorageCapacity: formData.irrigationStorageCapacity,
      
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

