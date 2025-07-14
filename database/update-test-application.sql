-- Update test application with comprehensive data
-- This adds all the new comprehensive fields to the existing application

UPDATE applications 
SET 
    -- Water Source Details
    water_body_name = 'Lake Muhazi',
    tributary_name = 'Nyabarongo River',
    catchment_name_level_1 = 'Nyabarongo Catchment',
    catchment_name_level_2 = 'Upper Nyabarongo',
    water_reliability = 'always_available',
    natural_discharge_volume_m3 = 86400.0,
    
    -- Water Usage Breakdown
    max_daily_volume_m3 = 750.0,
    max_monthly_volume_m3 = 22500.0,
    max_yearly_volume_m3 = 273750.0,
    flow_rate_m3_per_second = 0.0087,
    abstraction_facilities_description = 'Industrial-grade submersible pump system with automated controls, backup power supply, and remote monitoring capabilities',
    return_flow_location = 'Municipal wastewater treatment plant, 2.5km downstream',
    return_flow_volume_m3 = 600.0,
    proposed_duration_months = 6,
    proposed_duration_years = 25,
    pumping_hours_per_day = 18.5,
    
    -- Project Details
    proposed_facilities_description = 'Complete industrial water supply infrastructure including: intake structure, pump house, treatment facility, storage tanks, distribution network, monitoring systems, emergency backup systems',
    construction_type = 'Reinforced concrete structures, stainless steel piping, automated control systems',
    concession_area = 12.5,
    operational_overview = 'Continuous operation 18.5 hours/day with automated monitoring. Peak demand during business hours 6AM-10PM. Emergency backup systems ensure 99.9% uptime. Remote monitoring with 24/7 technical support.',
    
    -- Land Ownership
    owns_all_required_land = true,
    land_ownership_status = 'own_all_land',
    affected_landowners = NULL,
    easement_details = NULL,
    written_consent_details = NULL,
    lease_agreement_details = NULL,
    land_access_steps = 'All infrastructure will be constructed on company-owned industrial land. No additional land access required.',
    
    -- Enhanced location
    location_description = 'Industrial complex located in Kimihurura sector, 500m from main road, accessible via paved internal roads. GPS coordinates: -1.9441° S, 30.0619° E. Elevation: 1580m above sea level.',
    
    -- Updated timestamps
    updated_at = NOW()
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- Verify the update
SELECT 
    application_number,
    water_body_name,
    max_daily_volume_m3,
    proposed_facilities_description,
    owns_all_required_land,
    location_description
FROM applications 
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; 