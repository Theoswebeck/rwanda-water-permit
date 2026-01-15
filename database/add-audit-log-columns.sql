-- =============================================
-- Add missing columns to audit_logs table for Activity Logs feature
-- Run this migration in Supabase SQL Editor
-- =============================================

-- Create enums for severity and status if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_severity') THEN
        CREATE TYPE audit_severity AS ENUM ('info', 'warning', 'critical');
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_status') THEN
        CREATE TYPE audit_status AS ENUM ('success', 'failed');
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_entity_type') THEN
        CREATE TYPE audit_entity_type AS ENUM (
            'user', 
            'application', 
            'permit', 
            'inspection', 
            'review',
            'assessment',
            'document', 
            'payment',
            'system'
        );
    END IF;
END $$;

-- Add new columns to audit_logs table
ALTER TABLE audit_logs 
ADD COLUMN IF NOT EXISTS severity audit_severity DEFAULT 'info',
ADD COLUMN IF NOT EXISTS status audit_status DEFAULT 'success',
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS entity_type audit_entity_type;

-- Add index for faster filtering
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON audit_logs(severity);
CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON audit_logs(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON audit_logs(entity_type);

-- Add composite index for common filter combinations
CREATE INDEX IF NOT EXISTS idx_audit_logs_filters ON audit_logs(created_at DESC, entity_type, severity, status);

-- Update RLS policies for audit_logs (staff access)
DROP POLICY IF EXISTS "Admins can view all audit logs" ON audit_logs;
DROP POLICY IF EXISTS "Staff can view all audit logs" ON audit_logs;
CREATE POLICY "Staff can view all audit logs"
    ON audit_logs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role IN ('admin', 'approver', 'assessor', 'verifier', 'reviewer', 'inspector')
        )
    );

DROP POLICY IF EXISTS "System can insert audit logs" ON audit_logs;
CREATE POLICY "System can insert audit logs"
    ON audit_logs FOR INSERT
    WITH CHECK (true);

-- Comment on new columns
COMMENT ON COLUMN audit_logs.severity IS 'Severity level of the action: info, warning, or critical';
COMMENT ON COLUMN audit_logs.status IS 'Status of the action: success or failed';
COMMENT ON COLUMN audit_logs.description IS 'Human-readable description of the action';
COMMENT ON COLUMN audit_logs.entity_type IS 'Type of entity affected by the action';

-- =============================================
-- Migration complete!
-- =============================================
