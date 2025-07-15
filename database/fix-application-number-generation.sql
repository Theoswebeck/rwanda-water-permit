-- =============================================
-- Fix for Application Number Generation Bug
-- =============================================

-- The issue: SUBSTRING(application_number FROM 9) extracts "-000001" instead of "000001"
-- For "RWB-2025-000001", position 9 starts at the hyphen, not the number
-- Correct position should be 10 to extract just the numeric part

-- Drop the existing function and recreate it with the fix
DROP FUNCTION IF EXISTS generate_application_number() CASCADE;

-- Create the corrected function
CREATE OR REPLACE FUNCTION generate_application_number()
RETURNS TRIGGER AS $$
DECLARE
    year_prefix VARCHAR(4);
    counter INTEGER;
    new_number VARCHAR(50);
BEGIN
    IF NEW.application_number IS NULL THEN
        year_prefix := EXTRACT(YEAR FROM NOW())::VARCHAR;
        
        -- Fixed: Extract from position 10 to get just the numeric part
        -- For "RWB-2025-000001", this extracts "000001"
        SELECT COALESCE(MAX(CAST(SUBSTRING(application_number FROM 10) AS INTEGER)), 0) + 1
        INTO counter
        FROM applications
        WHERE application_number LIKE 'RWB-' || year_prefix || '-%';
        
        new_number := 'RWB-' || year_prefix || '-' || LPAD(counter::VARCHAR, 6, '0');
        NEW.application_number := new_number;
        
        -- Debug logging (optional - can be removed in production)
        RAISE NOTICE 'Generated application number: %, Counter: %', new_number, counter;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER trigger_generate_application_number
    BEFORE INSERT ON applications
    FOR EACH ROW
    EXECUTE FUNCTION generate_application_number();

-- Optional: Clean up any duplicate application numbers from the bug
-- (Run this only if you have duplicate numbers in your database)

-- First, check for duplicates
DO $$
DECLARE
    duplicate_count INTEGER;
BEGIN
    SELECT COUNT(*) 
    INTO duplicate_count
    FROM (
        SELECT application_number, COUNT(*) 
        FROM applications 
        WHERE application_number IS NOT NULL
        GROUP BY application_number 
        HAVING COUNT(*) > 1
    ) duplicates;
    
    RAISE NOTICE 'Found % duplicate application numbers', duplicate_count;
    
    -- If duplicates exist, we need to fix them
    IF duplicate_count > 0 THEN
        RAISE NOTICE 'Please manually resolve duplicate application numbers before proceeding';
    END IF;
END
$$;

-- Test the fixed function with a sample insert
-- (Uncomment the lines below to test)

/*
-- Test insert to verify the fix works
INSERT INTO applications (
    applicant_id,
    status,
    application_type,
    water_source,
    water_purpose,
    province,
    district,
    sector,
    cell,
    project_title
) VALUES (
    '550e8400-e29b-41d4-a716-446655440001', -- Use existing user ID
    'draft',
    'domestic',
    'borehole',
    'domestic',
    'Kigali',
    'Gasabo',
    'Kacyiru',
    'Kacyiru',
    'Test Application Number Generation'
);

-- Check the generated number
SELECT application_number, project_title 
FROM applications 
WHERE project_title = 'Test Application Number Generation';
*/ 