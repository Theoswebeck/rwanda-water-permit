-- Add 'land_access_doc' to the document_type enum
-- This allows proper tracking of land access documents (easement, consent, lease, etc.)

-- Add the new enum value
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'land_access_doc';

-- Note: After running this migration, update the code to use 'land_access_doc' instead of 'other'
-- in app/dashboard/new-application/page.tsx and app/dashboard/edit-application/[id]/page.tsx
-- Change: landAccessDocuments: 'other' → landAccessDocuments: 'land_access_doc'

