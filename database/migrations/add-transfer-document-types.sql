-- Migration: Add transfer document types to document_type enum
-- This fixes the issue where transfer application documents were not being saved
-- because the database enum didn't include the required transfer document types.

-- Add transfer document types to the enum
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'transfer_application_letter';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'signed_transfer_form';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'registration_certificate';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'existing_permit_copy';

-- Note: In PostgreSQL, you cannot add enum values within a transaction block.
-- Each ALTER TYPE statement must be committed separately.
-- Run these statements one at a time if running in a transaction.

-- If the above fails in a transaction, use this workaround:
-- 
-- 1. Create a new enum type with all values:
-- CREATE TYPE document_type_new AS ENUM (
--     'payment_proof', 'identification_doc', 'land_ownership_doc', 
--     'technical_drawings', 'environmental_impact_doc', 'intake_discharge_map',
--     'water_quality_report', 'geological_survey', 'business_license',
--     'land_access_doc', 'renewal_request_letter',
--     'transfer_application_letter', 'signed_transfer_form', 
--     'registration_certificate', 'existing_permit_copy',
--     'other'
-- );
--
-- 2. Update the column to use the new type:
-- ALTER TABLE documents ALTER COLUMN type TYPE document_type_new 
--     USING type::text::document_type_new;
--
-- 3. Drop the old type and rename:
-- DROP TYPE document_type;
-- ALTER TYPE document_type_new RENAME TO document_type;
