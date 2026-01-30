-- =============================================
-- Role Delegation (Acting Staff) Feature Migration
-- =============================================
-- This migration creates the role_delegations table to support
-- staff members delegating their roles to acting staff when out of office
-- =============================================

-- Create enum for delegation status if it doesn't exist
DO $$ BEGIN
    CREATE TYPE delegation_status AS ENUM ('active', 'revoked', 'expired');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create enum for delegatable roles if it doesn't exist
DO $$ BEGIN
    CREATE TYPE delegatable_role AS ENUM ('reviewer', 'verifier', 'approver', 'assessor', 'inspector');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create the role_delegations table
CREATE TABLE IF NOT EXISTS role_delegations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Delegation participants
    delegator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delegate_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Role being delegated
    delegated_role delegatable_role NOT NULL,
    
    -- Delegation details
    reason TEXT,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    end_date TIMESTAMP WITH TIME ZONE, -- NULL means indefinite
    
    -- Status tracking
    status delegation_status NOT NULL DEFAULT 'active',
    
    -- Revocation info
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoked_by UUID REFERENCES users(id) ON DELETE SET NULL,
    revocation_reason TEXT,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT different_users CHECK (delegator_id != delegate_id),
    CONSTRAINT valid_date_range CHECK (end_date IS NULL OR end_date > start_date),
    CONSTRAINT revocation_consistency CHECK (
        (status = 'revoked' AND revoked_at IS NOT NULL) OR
        (status != 'revoked' AND revoked_at IS NULL)
    )
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_role_delegations_delegator ON role_delegations(delegator_id);
CREATE INDEX IF NOT EXISTS idx_role_delegations_delegate ON role_delegations(delegate_id);
CREATE INDEX IF NOT EXISTS idx_role_delegations_status ON role_delegations(status);
CREATE INDEX IF NOT EXISTS idx_role_delegations_role ON role_delegations(delegated_role);
CREATE INDEX IF NOT EXISTS idx_role_delegations_dates ON role_delegations(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_role_delegations_active ON role_delegations(status, start_date, end_date) 
    WHERE status = 'active';

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_role_delegation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_role_delegation_updated_at ON role_delegations;
CREATE TRIGGER trigger_update_role_delegation_updated_at
    BEFORE UPDATE ON role_delegations
    FOR EACH ROW
    EXECUTE FUNCTION update_role_delegation_updated_at();

-- Create function to automatically expire delegations
CREATE OR REPLACE FUNCTION expire_ended_delegations()
RETURNS void AS $$
BEGIN
    UPDATE role_delegations
    SET status = 'expired',
        updated_at = NOW()
    WHERE status = 'active'
      AND end_date IS NOT NULL
      AND end_date < NOW();
END;
$$ LANGUAGE plpgsql;

-- Create function to get active delegations for a user (as delegate)
CREATE OR REPLACE FUNCTION get_active_delegations_for_user(user_uuid UUID)
RETURNS TABLE (
    delegation_id UUID,
    delegator_id UUID,
    delegated_role delegatable_role,
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    -- First, expire any ended delegations
    PERFORM expire_ended_delegations();
    
    RETURN QUERY
    SELECT 
        rd.id as delegation_id,
        rd.delegator_id,
        rd.delegated_role,
        rd.start_date,
        rd.end_date
    FROM role_delegations rd
    WHERE rd.delegate_id = user_uuid
      AND rd.status = 'active'
      AND rd.start_date <= NOW()
      AND (rd.end_date IS NULL OR rd.end_date > NOW());
END;
$$ LANGUAGE plpgsql;

-- Create function to check if user has an active delegation for a specific role
CREATE OR REPLACE FUNCTION has_active_delegation(
    user_uuid UUID,
    check_role delegatable_role
)
RETURNS BOOLEAN AS $$
DECLARE
    has_delegation BOOLEAN;
BEGIN
    -- First, expire any ended delegations
    PERFORM expire_ended_delegations();
    
    SELECT EXISTS (
        SELECT 1
        FROM role_delegations rd
        WHERE rd.delegate_id = user_uuid
          AND rd.delegated_role = check_role
          AND rd.status = 'active'
          AND rd.start_date <= NOW()
          AND (rd.end_date IS NULL OR rd.end_date > NOW())
    ) INTO has_delegation;
    
    RETURN has_delegation;
END;
$$ LANGUAGE plpgsql;

-- Create RLS policies for role_delegations table
ALTER TABLE role_delegations ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can see all delegations
CREATE POLICY admin_view_all_delegations ON role_delegations
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

-- Policy: Users can view delegations they created or received
CREATE POLICY user_view_own_delegations ON role_delegations
    FOR SELECT
    TO authenticated
    USING (
        delegator_id = auth.uid() OR delegate_id = auth.uid()
    );

-- Policy: Staff users can create delegations for their own role
CREATE POLICY staff_create_delegation ON role_delegations
    FOR INSERT
    TO authenticated
    WITH CHECK (
        delegator_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role IN ('reviewer', 'verifier', 'approver', 'assessor', 'inspector', 'admin')
        )
    );

-- Policy: Users can update/revoke their own delegations or admins can update any
CREATE POLICY user_update_own_delegation ON role_delegations
    FOR UPDATE
    TO authenticated
    USING (
        delegator_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

-- Policy: Users can delete their own pending delegations (before start) or admins can delete any
CREATE POLICY user_delete_own_delegation ON role_delegations
    FOR DELETE
    TO authenticated
    USING (
        (delegator_id = auth.uid() AND start_date > NOW()) OR
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

-- Add comment to table
COMMENT ON TABLE role_delegations IS 'Tracks role delegations (acting staff assignments) when staff members are out of office';

-- =============================================
-- Sample queries for reference
-- =============================================

-- Get all active delegations for a specific delegate user
-- SELECT * FROM get_active_delegations_for_user('user-uuid-here');

-- Check if a user has been delegated the approver role
-- SELECT has_active_delegation('user-uuid-here', 'approver');

-- Get all delegations made by a specific user (delegator)
-- SELECT rd.*, 
--        d.first_name as delegate_first_name, 
--        d.last_name as delegate_last_name,
--        d.email as delegate_email
-- FROM role_delegations rd
-- JOIN users d ON d.id = rd.delegate_id
-- WHERE rd.delegator_id = 'user-uuid-here'
-- ORDER BY rd.created_at DESC;

-- Get all active delegations with user details
-- SELECT rd.*,
--        dor.first_name as delegator_first_name,
--        dor.last_name as delegator_last_name,
--        dor.email as delegator_email,
--        dee.first_name as delegate_first_name,
--        dee.last_name as delegate_last_name,
--        dee.email as delegate_email
-- FROM role_delegations rd
-- JOIN users dor ON dor.id = rd.delegator_id
-- JOIN users dee ON dee.id = rd.delegate_id
-- WHERE rd.status = 'active'
-- ORDER BY rd.created_at DESC;
