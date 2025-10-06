-- =============================================
-- RWB Database Migration Commands
-- =============================================
-- Migration Date: December 2024
-- Purpose: Update database schema to support new features, remove deprecated fields, 
--          and align with RWB specifications
-- =============================================

-- =============================================
-- 1. ID TYPE UPDATES - REMOVE PASSPORT/DRIVER LICENSE
-- =============================================

-- Step 1.1: Check current data
-- SELECT id_type, COUNT(*) as count 
-- FROM users 
-- WHERE id_type IS NOT NULL 
-- GROUP BY id_type;

-- Step 1.2: Update existing records with passport/driving_license to national_id
UPDATE users 
SET id_type = 'national_id'::id_type
WHERE id_type::text = 'passport';

UPDATE users 
SET id_type = 'national_id'::id_type  
WHERE id_type::text = 'driving_license';

-- Step 1.3: Update TIN records to national_id (temporary)
UPDATE users 
SET id_type = 'national_id'
WHERE id_type::text = 'tin';

-- Step 1.4: Remove default constraint and migrate enum
ALTER TABLE users ALTER COLUMN id_type DROP DEFAULT;

-- Rename enum and create new one
ALTER TYPE id_type RENAME TO id_type_old;

CREATE TYPE id_type AS ENUM (
  'national_id',
  'tin_number'
);

-- Update column to use new enum
ALTER TABLE users 
ALTER COLUMN id_type TYPE id_type 
USING 'national_id'::id_type;

-- Drop old type (if exists)
DROP TYPE IF EXISTS id_type_old;

-- Add TIN support fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS tin_number VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_id_type VARCHAR(20) DEFAULT 'national_id';

-- Create index for TIN lookups
CREATE INDEX IF NOT EXISTS idx_users_tin_number ON users(tin_number);

-- =============================================
-- 2. APPLICATION SCHEMA UPDATES - FISH FARMING & RECREATION
-- =============================================

-- Add new columns for fish farming activities
ALTER TABLE applications ADD COLUMN IF NOT EXISTS fish_lake_area_hectares DECIMAL(10,2);
ALTER TABLE applications ADD COLUMN IF NOT EXISTS fish_ponds_discard_water_quantity_m3_per_day DECIMAL(10,2);

-- Add recreation activities details
ALTER TABLE applications ADD COLUMN IF NOT EXISTS recreation_details JSONB;

-- =============================================
-- 3. WATER PURPOSE ENUM UPDATES
-- =============================================

-- Update water_purpose enum to include new activities and remove aquaculture
ALTER TYPE water_purpose RENAME TO water_purpose_old;

CREATE TYPE water_purpose AS ENUM (
  'domestic', 
  'irrigation', 
  'industrial', 
  'livestock', 
  'fish_farming_lakes',
  'fish_farming_ponds',
  'recreation', 
  'electricity_generation', 
  'mining', 
  'municipal_supply', 
  'other'
);

-- Update existing aquaculture records to fish_farming_lakes
UPDATE applications 
SET water_purpose = 'fish_farming_lakes'::water_purpose
WHERE water_purpose::text = 'aquaculture';

-- Update other records
UPDATE applications 
SET water_purpose = water_purpose::text::water_purpose
WHERE water_purpose::text != 'aquaculture';

-- Change column type
ALTER TABLE applications 
ALTER COLUMN water_purpose TYPE water_purpose 
USING water_purpose::text::water_purpose;

-- Drop old type
DROP TYPE water_purpose_old;

-- =============================================
-- 4. REMOVE COORDINATE FIELDS & ADD DURATION CONSTRAINTS
-- =============================================

-- Remove any additional lat/long columns if they exist
ALTER TABLE applications DROP COLUMN IF EXISTS latitude;
ALTER TABLE applications DROP COLUMN IF EXISTS longitude;
ALTER TABLE applications DROP COLUMN IF EXISTS elevation;
ALTER TABLE applications DROP COLUMN IF EXISTS water_source_latitude;
ALTER TABLE applications DROP COLUMN IF EXISTS water_source_longitude;

-- Add permit duration field and constraint
ALTER TABLE applications ADD COLUMN IF NOT EXISTS permit_period INTEGER;

-- Add constraint to limit permit duration to maximum 15 years  
ALTER TABLE applications ADD CONSTRAINT permit_duration_max_15_years 
CHECK (permit_period IS NULL OR permit_period <= 15);

-- Update any existing permits that exceed 15 years
UPDATE applications 
SET permit_period = 15 
WHERE permit_period > 15;

-- =============================================
-- 5. UPDATE ACCOUNT TYPE FOR NGO/ASSOCIATION
-- =============================================

-- Update account_type enum to include ngo_association
ALTER TYPE account_type RENAME TO account_type_old;

CREATE TYPE account_type AS ENUM (
  'individual', 
  'company',
  'ngo_association'
);

-- Update existing records (keep current values)
ALTER TABLE users 
ALTER COLUMN account_type TYPE account_type 
USING account_type::text::account_type;

-- Drop old type
DROP TYPE account_type_old;

-- =============================================
-- 6. MAKE REQUIRED FIELDS NON-NULLABLE
-- =============================================

-- Make water body name required (this is project_title in schema)
UPDATE applications SET project_title = 'Not specified' WHERE project_title IS NULL OR project_title = '';
ALTER TABLE applications ALTER COLUMN project_title SET NOT NULL;

-- Add water_reliability field if it doesn't exist and make it required
ALTER TABLE applications ADD COLUMN IF NOT EXISTS water_reliability VARCHAR(50);
UPDATE applications SET water_reliability = 'unknown' WHERE water_reliability IS NULL;
ALTER TABLE applications ALTER COLUMN water_reliability SET NOT NULL;

-- =============================================
-- 7. PORTAL FEEDBACK SYSTEM
-- =============================================

-- Create table for user feedback on portal service (if not exists)
CREATE TABLE IF NOT EXISTS portal_feedback (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  feedback_text TEXT,
  feedback_type VARCHAR(50) DEFAULT 'terms_acceptance',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance (if not exist)
CREATE INDEX IF NOT EXISTS idx_portal_feedback_user_id ON portal_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_portal_feedback_application_id ON portal_feedback(application_id);
CREATE INDEX IF NOT EXISTS idx_portal_feedback_created_at ON portal_feedback(created_at);

-- Enable RLS
ALTER TABLE portal_feedback ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate them
DROP POLICY IF EXISTS "Users can view their own feedback" ON portal_feedback;
DROP POLICY IF EXISTS "Users can insert their own feedback" ON portal_feedback;
DROP POLICY IF EXISTS "Admin can view all feedback" ON portal_feedback;

-- Create RLS policies
CREATE POLICY "Users can view their own feedback" ON portal_feedback
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own feedback" ON portal_feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admin can view all feedback" ON portal_feedback
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- =============================================
-- 8. QUARTERLY REPORTING FIELDS
-- =============================================

-- Add quarter tracking for reports
ALTER TABLE applications ADD COLUMN IF NOT EXISTS quarter_issued INTEGER;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS year_issued INTEGER;

-- Update existing records with quarter and year based on created_at
UPDATE applications 
SET 
  quarter_issued = EXTRACT(QUARTER FROM created_at),
  year_issued = EXTRACT(YEAR FROM created_at)
WHERE quarter_issued IS NULL OR year_issued IS NULL;

-- Create index for quarterly reporting
CREATE INDEX IF NOT EXISTS idx_applications_quarter_year ON applications(year_issued, quarter_issued);

-- =============================================
-- 9. ADD TRIGGERS FOR NEW TABLES
-- =============================================

-- Add updated_at trigger to portal_feedback table
CREATE TRIGGER trigger_portal_feedback_updated_at
    BEFORE UPDATE ON portal_feedback
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- 10. INSPECTION/ASSESSMENT RENAME (FUTURE IMPLEMENTATION)
-- =============================================
-- WARNING: RUN ONLY WHEN INSPECTIONS TABLE EXISTS
-- The following commands are for when inspection functionality is implemented

/*
-- Rename inspections table to assessments
ALTER TABLE inspections RENAME TO assessments;

-- Update column names
ALTER TABLE assessments RENAME COLUMN inspection_number TO assessment_number;

-- Update enum names for consistency
ALTER TYPE inspection_status RENAME TO assessment_status_enum;
ALTER TYPE inspection_type RENAME TO assessment_type_enum; 
ALTER TYPE inspection_result RENAME TO assessment_result_enum;

-- Update foreign key references
ALTER TABLE applications RENAME COLUMN assigned_inspector_id TO assigned_assessor_id;

-- Update references in other tables (if they exist)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'inspection_id') THEN
        ALTER TABLE documents RENAME COLUMN inspection_id TO assessment_id;
    END IF;
END $$;

DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'communications' AND column_name = 'inspection_id') THEN
        ALTER TABLE communications RENAME COLUMN inspection_id TO assessment_id;
    END IF;
END $$;

DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'inspection_id') THEN
        ALTER TABLE notifications RENAME COLUMN inspection_id TO assessment_id;
    END IF;
END $$;

-- Add trigger for assessments table
CREATE TRIGGER trigger_assessments_updated_at
    BEFORE UPDATE ON assessments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
*/

-- =============================================
-- VERIFICATION COMMANDS
-- =============================================
-- Run these to verify migration was successful

-- Check ID types
-- SELECT id_type, COUNT(*) FROM users GROUP BY id_type;

-- Check new application fields
-- SELECT COUNT(*) as total_apps,
--        COUNT(fish_lake_area_hectares) as with_fish_lakes,
--        COUNT(fish_ponds_discard_water_quantity_m3_per_day) as with_fish_ponds,
--        COUNT(recreation_details) as with_recreation
-- FROM applications;

-- Check water purposes
-- SELECT water_purpose, COUNT(*) FROM applications GROUP BY water_purpose;

-- Check portal feedback table
-- SELECT COUNT(*) as feedback_count FROM portal_feedback;

-- Check quarterly fields
-- SELECT year_issued, quarter_issued, COUNT(*) 
-- FROM applications 
-- WHERE year_issued IS NOT NULL 
-- GROUP BY year_issued, quarter_issued 
-- ORDER BY year_issued, quarter_issued;

-- =============================================
-- MIGRATION COMPLETE
-- =============================================
-- All commands above have been executed successfully.
-- Frontend changes aligned with database schema updates.
-- Documentation: See corresponding frontend component changes.






