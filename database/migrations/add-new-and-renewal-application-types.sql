-- Add 'new' and 'renewal' to the application_type enum.
-- The enum currently has: domestic, industrial, agricultural, commercial, municipal, mining_water_use, transfer, modification
-- Application types should include: new, transfer, modification, renewal

ALTER TYPE application_type ADD VALUE IF NOT EXISTS 'new';
ALTER TYPE application_type ADD VALUE IF NOT EXISTS 'renewal';
