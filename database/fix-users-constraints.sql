-- =============================================
-- Fix Users Table Check Constraints
-- Support New Account Types
-- =============================================

-- Drop existing constraints
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_individual_fields;
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_company_fields;

-- Add updated constraints for individual
ALTER TABLE users ADD CONSTRAINT chk_individual_fields CHECK (
    (
        account_type = 'individual' 
        AND first_name IS NOT NULL 
        AND last_name IS NOT NULL 
        AND company_name IS NULL 
        AND company_tin IS NULL 
        AND company_address IS NULL 
        AND company_phone IS NULL
    ) OR account_type != 'individual'
);

-- Add updated constraints for organizational types
ALTER TABLE users ADD CONSTRAINT chk_organizational_fields CHECK (
    (
        account_type IN ('company', 'cooperative', 'organization', 'institution') 
        AND company_name IS NOT NULL 
        AND company_tin IS NOT NULL 
        AND company_address IS NOT NULL 
        AND company_phone IS NOT NULL
        -- First and last name can be NULL for organizational types
    ) OR account_type = 'individual'
);

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Users table constraints updated successfully!';
    RAISE NOTICE '🎯 Now supports all account types';
    RAISE NOTICE '📋 Individual: Requires first/last name, no company fields';
    RAISE NOTICE '🏢 Organizational: Requires company fields, first/last optional';
END $$; 