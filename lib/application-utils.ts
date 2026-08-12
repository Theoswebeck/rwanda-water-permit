import type { Application } from '@/types/database';
import { polygonsToGeoJSON, type CoordinatePoint } from '@/lib/geoUtils';
import * as turf from '@turf/turf';

function parsePositiveNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }
  if (typeof value === 'string') {
    const normalized = value.replace(/,/g, '').trim();
    if (!normalized) return undefined;
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  return undefined;
}

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

// Helper function to map form water source types to database enum values
// Database enum: 'borehole', 'surface_water', 'river', 'groundwater', 'lake', 'spring', 'other'
export function formatWaterSourceForDB(waterSourceType: string): Application['water_source'] {
  if (!waterSourceType) return 'other';
  const waterSourceMap: Record<string, Application['water_source']> = {
    // Direct mappings to valid DB enum values
    'lake': 'lake',
    'spring': 'spring',
    'borehole': 'borehole',
    'river': 'river',
    'groundwater': 'groundwater',
    'surface_water': 'surface_water',
    'other': 'other',
    // Form values that need mapping
    'stream_river': 'river',
    'stream': 'river',
    'dam': 'surface_water',
    'swamp': 'surface_water',
    'reservoir': 'surface_water',
    'wetland': 'surface_water',
    'hydropower_source': 'surface_water',
  };
  return waterSourceMap[waterSourceType] || 'other';
}

// Helper function to map form activity types to database water_purpose enum values
// Database enum: 'domestic', 'irrigation', 'industrial', 'livestock', 'fish_farming_lakes', 'fish_farming_ponds', 'recreation', 'recreation_activities', 'electricity_generation', 'mining', 'municipal_supply', 'water_supply', 'coffee_washing', 'gaz_extraction', 'construction_of_dam', 'construction_of_infrastructures', 'navigation', 'port_construction', 'other'
export function formatWaterPurposeForDB(activity: string): Application['water_purpose'] {
  if (!activity) return 'other';
  const purposeMap: Record<string, Application['water_purpose']> = {
    'domestic': 'domestic',
    'irrigation': 'irrigation',
    'industrial': 'industrial',
    'livestock': 'livestock',
    'fish_farming_lakes': 'fish_farming_lakes',
    'fish_farming_ponds': 'fish_farming_ponds',
    'aquaculture': 'fish_farming_lakes',
    'recreation': 'recreation',
    'recreation_activities': 'recreation',
    'electricity_generation': 'electricity_generation',
    'mining': 'mining',
    'municipal_supply': 'municipal_supply',
    'other': 'other',
    'water_supply': 'water_supply',
    'coffee_washing': 'coffee_washing',
    'gaz_extraction': 'gaz_extraction',
    'construction_of_dam': 'construction_of_dam',
    'construction_of_infrastructures': 'construction_of_infrastructures',
    'navigation': 'navigation',
    'port_construction': 'port_construction',
    'other_concession': 'other_concession',
    'industry': 'industrial',
    'electricity': 'electricity_generation',
    'construction': 'industrial',
  };
  return purposeMap[activity] || 'other';
}

// Helper function to map form activity types to database application_type enum values
// Database enum: 'domestic', 'industrial', 'agricultural', 'commercial', 'municipal', 'mining_water_use', 'transfer', 'modification'
export function formatApplicationTypeForDB(activity: string): Application['application_type'] {
  if (!activity) return 'domestic';
  const typeMap: Record<string, Application['application_type']> = {
    // Direct mappings to valid DB enum values
    'domestic': 'domestic',
    'industrial': 'industrial',
    'agricultural': 'agricultural',
    'commercial': 'commercial',
    'municipal': 'municipal',
    'mining_water_use': 'mining_water_use',
    // Form activity values that need mapping
    'irrigation': 'agricultural',
    'water_supply': 'domestic',
    'aquaculture': 'agricultural',
    'fish_farming_lakes': 'agricultural',
    'fish_farming_ponds': 'agricultural',
    'coffee_washing': 'industrial',
    'industry': 'industrial',
    'electricity': 'industrial',
    'electricity_generation': 'industrial',
    'mining': 'mining_water_use',
    'construction': 'industrial',
    'construction_of_dam': 'industrial',
    'construction_of_infrastructures': 'industrial',
    'navigation': 'commercial',
    'port_construction': 'commercial',
    'recreation': 'commercial',
    'recreation_activities': 'commercial',
    'livestock': 'agricultural',
    'gaz_extraction': 'commercial',
    'other': 'domestic',
    'other_concession': 'commercial',
  };
  return typeMap[activity] || 'domestic';
}

// Mapping function to transform form data to database schema
export function mapFormDataToApplication(formData: any, status: 'draft' | 'submitted' = 'draft', userId?: string): Partial<Application> {
  const isTransferPayload =
    formData?.applicationType === 'transfer' ||
    formData?.isTransfer === true;

  if (isTransferPayload) {
    const fallbackSource = formatWaterSourceForDB(formData?.waterSourceType || formData?.waterSource || 'other');
    const fallbackPurpose = formatWaterPurposeForDB(formData?.waterPurpose || 'other');

    return {
      status,
      ...(status === 'submitted' ? { submitted_at: new Date().toISOString() } : {}),
      application_type: 'transfer' as Application['application_type'],
      water_source: fallbackSource,
      water_purpose: fallbackPurpose,
      province: formatProvinceForDB(formData?.province || formData?.officeProvince) || 'Kigali',
      district: formData?.district || formData?.officeDistrict || (status === 'draft' ? 'Draft District' : ''),
      sector: formData?.sector || formData?.officeSector || (status === 'draft' ? 'Draft Sector' : ''),
      cell: formData?.cell || formData?.officeCell || (status === 'draft' ? 'Draft Cell' : ''),
      project_title: formData?.transfereeName
        ? `Transfer: ${formData.transfereeName} Water Permit Application`
        : formData?.projectTitle
          ? `Transfer: ${formData.projectTitle}`
          : `Transfer: ${formData?.permitNumber || 'Permit'}`,
      project_description: `Permit transfer request for permit ${formData?.permitNumber || 'N/A'}`,
      internal_notes: JSON.stringify({
        isTransfer: true,
        originalPermitId: formData?.permitId,
        originalPermitNumber: formData?.permitNumber,
        transferFormData: formData ?? {},
      }),
      sla_status: 'on_time' as const,
      applicant_id: userId || '550e8400-e29b-41d4-a716-446655440001',
    };
  }

  const isRenewalPayload =
    formData?.applicationType === 'renewal' ||
    formData?.isRenewal === true ||
    Boolean(formData?.permitId) ||
    Boolean(formData?.renewed_from_permit_id);

  if (isRenewalPayload) {
    const fallbackType = formatApplicationTypeForDB(formData?.originalApplicationType || 'domestic');
    const fallbackSource = formatWaterSourceForDB(formData?.waterSource || 'other');
    const fallbackPurpose = formatWaterPurposeForDB(formData?.waterPurpose || 'other');

    return {
      status,
      ...(status === 'submitted' ? { submitted_at: new Date().toISOString() } : {}),
      application_type: fallbackType,
      water_source: fallbackSource,
      water_purpose: fallbackPurpose,
      province: formatProvinceForDB(formData?.province) || 'Kigali',
      district: formData?.district || (status === 'draft' ? 'Draft District' : ''),
      sector: formData?.sector || (status === 'draft' ? 'Draft Sector' : ''),
      cell: formData?.cell || (status === 'draft' ? 'Draft Cell' : ''),
      project_title: formData?.projectTitle
        ? `Renewal: ${formData.projectTitle}`
        : `Renewal: ${formData?.permitNumber || 'Permit'}`,
      project_description: `Permit renewal request for permit ${formData?.permitNumber || 'N/A'}`,
      intended_activities: Array.isArray(formData?.intendedActivities) ? formData.intendedActivities : undefined,
      is_renewal: true,
      renewed_from_permit_id: formData?.permitId || formData?.renewed_from_permit_id,
      internal_notes: JSON.stringify({
        isRenewal: true,
        originalPermitId: formData?.permitId || formData?.renewed_from_permit_id,
        originalPermitNumber: formData?.permitNumber,
        originalApplicationId: formData?.originalApplicationId,
        permitReference: formData?.permitReference || null,
        waterUseReport: formData?.waterUseReport ?? null,
        renewalFormData: formData ?? {},
      }),
      sla_status: 'on_time' as const,
      applicant_id: userId || '550e8400-e29b-41d4-a716-446655440001',
    };
  }

  // Handle coordinates: support single polygon (legacy waterSourceCoordinates) and multi-polygons (waterSourcePolygons)
  let coordinates: any = undefined;
  let polygonFeature: ReturnType<typeof polygonsToGeoJSON> = null;
  try {
    const polygons: CoordinatePoint[][] =
      Array.isArray(formData.waterSourcePolygons) && formData.waterSourcePolygons.length > 0
        ? formData.waterSourcePolygons
        : Array.isArray(formData.waterSourceCoordinates)
          ? [formData.waterSourceCoordinates]
          : [];

    polygonFeature = polygonsToGeoJSON(polygons);
    if (polygonFeature) {
      // Store GeoJSON geometry for PostGIS compatibility
      coordinates = polygonFeature.geometry;
    }
  } catch (error) {
    console.warn('Invalid coordinates provided:', error);
  }

  const concessionAreaHectares = (() => {
    // Primary source of truth: polygon geometry area.
    if (polygonFeature) {
      const areaSqMeters = turf.area(polygonFeature as any);
      if (Number.isFinite(areaSqMeters) && areaSqMeters > 0) {
        return Number((areaSqMeters / 10000).toFixed(4));
      }
    }

    // Fallbacks for legacy/manual form fields.
    const fishHa = parsePositiveNumber(formData.fishLakeAreaHectares);
    if (fishHa) return fishHa;

    const recreationM2 = parsePositiveNumber(formData.recreationConcessionAreaM2);
    if (recreationM2) return Number((recreationM2 / 10000).toFixed(4));

    const portConstructionM2 = parsePositiveNumber(formData.portConstructionConcessionAreaM2);
    if (portConstructionM2) return Number((portConstructionM2 / 10000).toFixed(4));

    const gazExtractionM2 = parsePositiveNumber(formData.gazExtractionConcessionAreaM2);
    if (gazExtractionM2) return Number((gazExtractionM2 / 10000).toFixed(4));

    const explicit = parsePositiveNumber(formData.concessionArea);
    if (explicit) {
      const unit = String(formData.concessionAreaUnit || '').toLowerCase();
      if (unit.includes('m2') || unit.includes('m²') || unit.includes('square meter')) {
        return Number((explicit / 10000).toFixed(4));
      }
      return explicit;
    }

    return undefined;
  })();

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

  // Map intended activities to application type and purpose (use first selected as primary for DB enums)
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
    'port_construction': 'commercial',
    'recreation': 'commercial', // legacy
    'recreation_activities': 'commercial',
    'livestock': 'agricultural',
    'gaz_extraction': 'commercial',
    'other': 'domestic',
    'other_concession': 'commercial'
  };

  const activityPurposeMap: Record<string, Application['water_purpose']> = {
    'irrigation': 'irrigation',
    'water_supply': 'water_supply',
    'aquaculture': 'fish_farming_lakes', // legacy -> migrated enum
    'fish_farming_lakes': 'fish_farming_lakes',
    'fish_farming_ponds': 'fish_farming_ponds',
    'coffee_washing': 'coffee_washing',
    'industry': 'industrial',
    'electricity': 'electricity_generation', // legacy
    'electricity_generation': 'electricity_generation',
    'mining': 'mining',
    'construction': 'industrial', // legacy
    'construction_of_dam': 'construction_of_dam',
    'construction_of_infrastructures': 'construction_of_infrastructures',
    'navigation': 'navigation',
    'port_construction': 'port_construction',
    'recreation': 'recreation', // legacy
    'recreation_activities': 'recreation',
    'livestock': 'livestock',
    'gaz_extraction': 'gaz_extraction',
    'other': 'domestic',
    'other_concession': 'other_concession'
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

  // Persist metadata for dynamic additional documents, but never embed File blobs in internal_notes.
  const serializedAdditionalDocuments = Array.isArray(formData?.additionalDocuments)
    ? formData.additionalDocuments.map((doc: any) => ({
        id: doc?.id || '',
        name: doc?.name || '',
        category: doc?.category || 'additional',
        description: doc?.description || '',
        // Keep URL for previously uploaded docs; file objects are intentionally omitted.
        url: typeof doc?.url === 'string' ? doc.url : undefined,
        file: null,
      }))
    : [];

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

    // Store the multi-select activity list explicitly on the application record
    intended_activities: Array.isArray(formData.intendedActivities) ? formData.intendedActivities : undefined,
    
    // Permit duration (years) - requested by applicant, can be modified by assessor
    proposed_duration_years: formData.permitLengthYears,
    
    // Technical specifications - based on new form structure
    water_taking_method: formData.waterAbstractionDetails?.[0]?.abstractionMethod || undefined,
    water_measuring_method: 'Flow meter', // Default for drafts
    concession_area: concessionAreaHectares,
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
      representativePosition: formData.representativePosition,
      
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
      // Water activity area polygons (concession activities like fish farming/recreation)
      // Persist explicitly so submitted applications can be restored without relying only on geometry.
      waterSourcePolygons: formData.waterSourcePolygons,
      // Legacy back-compat key kept for older readers.
      waterSourceCoordinates: formData.waterSourceCoordinates,
      
      // Reliability
      waterReliability: formData.waterReliability,
      
      // Permit Length (Years)
      permitLengthYears: formData.permitLengthYears,
      
      // SECTION 3: INTENDED ACTIVITY
      intendedActivities: formData.intendedActivities,
      intendedActivityOther: formData.intendedActivityOther,
      
      // Water Abstraction
      methodOfWaterAbstraction: formData.methodOfWaterAbstraction,
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
      industryDetails: formData.industryDetails,
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
      fishPondsSurfaceAreaM2: formData.fishPondsSurfaceAreaM2,
      fishPondsCapacityM3: formData.fishPondsCapacityM3,
      fishPondsRefillFrequency: formData.fishPondsRefillFrequency,
      fishPondsDiscardWaterQuantityM3PerDay: formData.fishPondsDiscardWaterQuantityM3PerDay,
      
      // Coffee washing fields
      coffeeWashingQuantityPerDay: formData.coffeeWashingQuantityPerDay,
      coffeeWashingQuantityPerMonth: formData.coffeeWashingQuantityPerMonth,
      coffeeWashingCapacityTonsPerYear: formData.coffeeWashingCapacityTonsPerYear,
      
      // Hydropower/electricity fields
      hydropowerQuantityPerYear: formData.hydropowerQuantityPerYear,
      hydropowerIntakeToPowerhouseDistanceM: formData.hydropowerIntakeToPowerhouseDistanceM,
      hydropowerHasDownstreamUsers: formData.hydropowerHasDownstreamUsers,
      hydropowerPlantCapacityMw: formData.hydropowerPlantCapacityMw,
      
      // Construction of dam fields
      constructionDamPurpose: formData.constructionDamPurpose,
      constructionDamDescription: formData.constructionDamDescription,
      constructionDamExpectedDuration: formData.constructionDamExpectedDuration,
      constructionDamAlterationPlans: formData.constructionDamAlterationPlans,
      
      // Infrastructure fields
      infrastructurePurpose: formData.infrastructurePurpose,
      infrastructureDescription: formData.infrastructureDescription,
      infrastructureExpectedDuration: formData.infrastructureExpectedDuration,
      infrastructureAlterationPlans: formData.infrastructureAlterationPlans,
      
      // Recreation fields
      recreationType: formData.recreationType,
      recreationProjectDescription: formData.recreationProjectDescription,
      recreationConcessionAreaM2: formData.recreationConcessionAreaM2,

      // Port construction fields
      portConstructionPurpose: formData.portConstructionPurpose,
      portConstructionDescription: formData.portConstructionDescription,
      portConstructionConcessionAreaM2: formData.portConstructionConcessionAreaM2,
      portConstructionDuration: formData.portConstructionDuration,

      // Gas extraction fields
      gazExtractionPurpose: formData.gazExtractionPurpose,
      gazExtractionDescription: formData.gazExtractionDescription,
      gazExtractionConcessionAreaM2: formData.gazExtractionConcessionAreaM2,
      gazExtractionWaterAmountM3PerDay: formData.gazExtractionWaterAmountM3PerDay,

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
      additionalDocuments: serializedAdditionalDocuments,
      
      // Metadata for legacy compatibility
      _legacy: {
        category: formData.categoryApplicant,
        activities: formData.intendedActivities?.join(', ') || 'Not specified',
        waterSource: formData.waterSourceType || 'Not specified',
        contact: formData.emailAddress || 'Not provided'
      },
      permitReference: formData.permitReference || null,
    }),
    
    // Modification tracking fields (only set if this is a modification request)
    ...(formData.isModification ? {
      is_modification: true,
      modified_from_application_id: formData.originalApplicationId,
      modification_changes: formData.modificationChanges,
    } : {}),

    // Bulk applicant fields — only set when bulk_networks is a non-empty array,
    // preventing non-bulk payloads from accidentally triggering the bulk permit path
    ...(Array.isArray((formData as any).bulk_networks) && (formData as any).bulk_networks.length > 0 ? {
      is_bulk: true,
      bulk_networks: (formData as any).bulk_networks,
      ...((formData as any).bulk_district ? { bulk_district: (formData as any).bulk_district } : {}),
    } : {}),

    // SLA tracking
    sla_status: 'on_time' as const,

    // Use the actual authenticated user's ID
    applicant_id: userId || '550e8400-e29b-41d4-a716-446655440001', // Fallback to sample ID for development
  };

  return mappedData;
}

/**
 * Enriches modification_changes with missing `previous` values.
 *
 * When `computeModificationChanges` stored `undefined` as a previous value,
 * JSON.stringify silently dropped the key, leaving `{ current: X }` without
 * `previous`. This helper reconstructs the missing previous values from the
 * original application's data (internal_notes + top-level columns).
 *
 * @param modificationChanges - The stored modification changes (may have missing `previous`)
 * @param originalApplication - The original application that was being modified
 * @returns A new object with missing `previous` values filled in
 */
export function enrichModificationChanges(
  modificationChanges: Record<string, { previous?: any; current?: any }> | null | undefined,
  originalApplication: any | null | undefined,
): Record<string, { previous: any; current: any }> {
  if (!modificationChanges || typeof modificationChanges !== 'object') return {};

  // Parse internal_notes from the original application to get original form values
  let originalFormData: Record<string, any> = {};
  if (originalApplication) {
    try {
      const parsed = JSON.parse(originalApplication.internal_notes || '{}');
      if (parsed && typeof parsed === 'object') {
        originalFormData = parsed;
      }
    } catch {
      // ignore parse errors
    }
  }

  // Map of form field names → application-level column names (fallback sources)
  const columnFallbacks: Record<string, string> = {
    permitLengthYears: 'proposed_duration_years',
    intendedActivities: 'intended_activities',
    waterAbstraction_maxAverageYearly: 'estimated_usage_volume',
    waterAbstraction_abstractionMethod: 'water_taking_method',
  };

  // Map of flattened waterAbstraction sub-field keys → paths inside internal_notes
  const nestedLookups: Record<string, (formData: Record<string, any>) => any> = {
    waterAbstraction_flowRate: (fd) => (fd.waterAbstractionDetails || [])[0]?.flowRate,
    waterAbstraction_maxAverageYearly: (fd) => (fd.waterAbstractionDetails || [])[0]?.maxAverageYearly,
    waterAbstraction_abstractionMethod: (fd) => (fd.waterAbstractionDetails || [])[0]?.abstractionMethod,
  };

  const enriched: Record<string, { previous: any; current: any }> = {};

  for (const [fieldName, change] of Object.entries(modificationChanges)) {
    const hasPrevious = change && ('previous' in change) && change.previous !== undefined && change.previous !== null;

    if (hasPrevious) {
      enriched[fieldName] = { previous: change.previous, current: change.current };
    } else {
      let reconstructedPrevious: any = null;

      // 1. Try nested lookup (for flattened waterAbstraction / industry sub-fields)
      if (nestedLookups[fieldName]) {
        const val = nestedLookups[fieldName](originalFormData);
        if (val !== undefined && val !== null) {
          reconstructedPrevious = val;
        }
      }
      // 2. Try direct internal_notes form data
      if (reconstructedPrevious === null && originalFormData[fieldName] !== undefined && originalFormData[fieldName] !== null) {
        reconstructedPrevious = originalFormData[fieldName];
      }
      // 3. Try application-level column fallback
      if (reconstructedPrevious === null && columnFallbacks[fieldName] && originalApplication) {
        const colName = columnFallbacks[fieldName];
        const colValue = originalApplication[colName];
        if (colValue !== undefined && colValue !== null) {
          reconstructedPrevious = colValue;
        }
      }

      enriched[fieldName] = {
        previous: reconstructedPrevious,
        current: change.current,
      };
    }
  }

  return enriched;
}