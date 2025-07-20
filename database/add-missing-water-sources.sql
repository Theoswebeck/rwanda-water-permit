-- =============================================
-- Add Missing Water Source Types to Database
-- =============================================

-- Add missing water source types that are in the form but not in the database
ALTER TYPE water_source_type ADD VALUE IF NOT EXISTS 'dam';
ALTER TYPE water_source_type ADD VALUE IF NOT EXISTS 'stream';
ALTER TYPE water_source_type ADD VALUE IF NOT EXISTS 'swamp';
ALTER TYPE water_source_type ADD VALUE IF NOT EXISTS 'reservoir';
ALTER TYPE water_source_type ADD VALUE IF NOT EXISTS 'wetland';
ALTER TYPE water_source_type ADD VALUE IF NOT EXISTS 'hydropower_source';

-- Note: PostgreSQL enums can only add values, not modify existing ones
-- This script adds all missing water source types from the application form 