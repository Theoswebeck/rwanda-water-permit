-- Add distinct activity codes to the water_purpose enum.
-- These activities are used extensively across the system (PDFs, labels,
-- annex requirements, application form) but were previously missing from
-- the DB enum, causing lossy mapping to generic categories like 'industrial'
-- or 'recreation'.

ALTER TYPE water_purpose ADD VALUE IF NOT EXISTS 'water_supply';
ALTER TYPE water_purpose ADD VALUE IF NOT EXISTS 'coffee_washing';
ALTER TYPE water_purpose ADD VALUE IF NOT EXISTS 'gaz_extraction';
ALTER TYPE water_purpose ADD VALUE IF NOT EXISTS 'construction_of_dam';
ALTER TYPE water_purpose ADD VALUE IF NOT EXISTS 'construction_of_infrastructures';
ALTER TYPE water_purpose ADD VALUE IF NOT EXISTS 'navigation';
