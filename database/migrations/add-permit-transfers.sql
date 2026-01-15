-- =============================================
-- PERMIT TRANSFERS TABLE MIGRATION
-- =============================================
-- This migration adds support for water permit transfers
-- between owners/holders as per RWB requirements.
-- =============================================

-- Create permit_transfers table to track transfer requests
CREATE TABLE IF NOT EXISTS permit_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Reference to the permit being transferred
    permit_id UUID NOT NULL REFERENCES permits(id) ON DELETE CASCADE,
    
    -- Reference to the application created for this transfer
    application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
    
    -- Transfer status
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',       -- Initial state, awaiting review
        'under_review',  -- Being reviewed by staff
        'approved',      -- Transfer approved by DG
        'rejected',      -- Transfer rejected
        'cancelled'      -- Cancelled by applicant
    )),
    
    -- PART 1: Permit Particulars (reference only, actual data in permits table)
    -- These are captured at transfer time for historical record
    permit_number_at_transfer VARCHAR(100) NOT NULL,
    effective_date_at_transfer DATE,
    expiration_date_at_transfer DATE,
    facility_project_name VARCHAR(500),
    location_province VARCHAR(100),
    location_district VARCHAR(100),
    location_sector VARCHAR(100),
    
    -- PART 2: Transferor (Current Permit Holder) Details
    transferor_name VARCHAR(500) NOT NULL,
    transferor_representative_name VARCHAR(255),
    transferor_representative_position VARCHAR(255),
    transferor_address_province VARCHAR(100),
    transferor_address_district VARCHAR(100),
    transferor_address_sector VARCHAR(100),
    transferor_email VARCHAR(255),
    transferor_phone VARCHAR(50),
    transferor_title_position VARCHAR(255),
    transferor_certification_date DATE,
    transferor_certified BOOLEAN DEFAULT FALSE,
    
    -- PART 3: Transferee (New Owner) Details
    transferee_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    transferee_name VARCHAR(500) NOT NULL,
    transferee_representative_name VARCHAR(255),
    transferee_representative_position VARCHAR(255),
    transferee_address_province VARCHAR(100),
    transferee_address_district VARCHAR(100),
    transferee_address_sector VARCHAR(100),
    transferee_email VARCHAR(255) NOT NULL,
    transferee_phone VARCHAR(50),
    transferee_title_position VARCHAR(255),
    transferee_certification_date DATE,
    transferee_certified BOOLEAN DEFAULT FALSE,
    
    -- PART 4: Approval Details (filled by RWB staff)
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    approval_notes TEXT,
    rejection_reason TEXT,
    
    -- Transfer reason/justification
    transfer_reason TEXT,
    
    -- Documents tracking (JSONB for flexibility)
    -- Contains references to uploaded documents:
    -- - application_letter
    -- - payment_proof
    -- - signed_transfer_form
    -- - registration_certificate
    -- - existing_permit_copy
    documents JSONB DEFAULT '{}',
    
    -- Workflow tracking
    submitted_at TIMESTAMP WITH TIME ZONE,
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    review_notes TEXT,
    
    -- SLA tracking
    due_date TIMESTAMP WITH TIME ZONE,
    sla_status VARCHAR(20) DEFAULT 'on_time' CHECK (sla_status IN ('on_time', 'due_soon', 'overdue')),
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Internal notes for staff
    internal_notes TEXT
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_permit_transfers_permit_id ON permit_transfers(permit_id);
CREATE INDEX IF NOT EXISTS idx_permit_transfers_application_id ON permit_transfers(application_id);
CREATE INDEX IF NOT EXISTS idx_permit_transfers_status ON permit_transfers(status);
CREATE INDEX IF NOT EXISTS idx_permit_transfers_transferee_user_id ON permit_transfers(transferee_user_id);
CREATE INDEX IF NOT EXISTS idx_permit_transfers_created_at ON permit_transfers(created_at DESC);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_permit_transfers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_permit_transfers_updated_at ON permit_transfers;
CREATE TRIGGER trigger_update_permit_transfers_updated_at
    BEFORE UPDATE ON permit_transfers
    FOR EACH ROW
    EXECUTE FUNCTION update_permit_transfers_updated_at();

-- Enable RLS on permit_transfers table
ALTER TABLE permit_transfers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for permit_transfers

-- Applicants can view their own transfer requests (as transferee)
CREATE POLICY "Applicants can view own transfer requests"
ON permit_transfers FOR SELECT
TO authenticated
USING (
    transferee_user_id = auth.uid()
);

-- Applicants can create transfer requests
CREATE POLICY "Applicants can create transfer requests"
ON permit_transfers FOR INSERT
TO authenticated
WITH CHECK (
    transferee_user_id = auth.uid()
);

-- Applicants can update their pending transfer requests
CREATE POLICY "Applicants can update pending transfers"
ON permit_transfers FOR UPDATE
TO authenticated
USING (
    transferee_user_id = auth.uid() AND status IN ('pending', 'under_review')
)
WITH CHECK (
    transferee_user_id = auth.uid() AND status IN ('pending', 'under_review')
);

-- Staff can view all transfer requests
CREATE POLICY "Staff can view all transfers"
ON permit_transfers FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid()
        AND users.role IN ('admin', 'approver', 'reviewer', 'assessor', 'verifier')
    )
);

-- Staff can update all transfer requests
CREATE POLICY "Staff can update all transfers"
ON permit_transfers FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid()
        AND users.role IN ('admin', 'approver', 'reviewer', 'assessor', 'verifier')
    )
);

-- Add comments for documentation
COMMENT ON TABLE permit_transfers IS 'Tracks water use permit transfer requests between owners/holders';
COMMENT ON COLUMN permit_transfers.permit_id IS 'Reference to the permit being transferred';
COMMENT ON COLUMN permit_transfers.application_id IS 'Optional reference to the application created for this transfer';
COMMENT ON COLUMN permit_transfers.transferor_certified IS 'Indicates if the transferor has certified the transfer';
COMMENT ON COLUMN permit_transfers.transferee_certified IS 'Indicates if the transferee has acknowledged responsibility';
COMMENT ON COLUMN permit_transfers.documents IS 'JSONB containing references to uploaded transfer documents';

-- =============================================
-- SAMPLE QUERIES FOR REFERENCE
-- =============================================
-- 
-- Get all pending transfers:
-- SELECT * FROM permit_transfers WHERE status = 'pending' ORDER BY created_at DESC;
--
-- Get transfers for a specific permit:
-- SELECT * FROM permit_transfers WHERE permit_id = '<permit-uuid>' ORDER BY created_at DESC;
--
-- Get transfers for a user (as transferee):
-- SELECT pt.*, p.permit_number 
-- FROM permit_transfers pt
-- JOIN permits p ON pt.permit_id = p.id
-- WHERE pt.transferee_user_id = '<user-uuid>'
-- ORDER BY pt.created_at DESC;
--
-- =============================================
