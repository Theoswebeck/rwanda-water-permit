-- =====================================================
-- Add Permit Holder Inspection Checklist Fields
-- =====================================================
-- This migration adds comprehensive fields to the inspections table
-- to support the 12-section permit holder inspection checklist template

-- Add Activity Details (Section 2)
ALTER TABLE inspections 
ADD COLUMN IF NOT EXISTS activity_type TEXT,
ADD COLUMN IF NOT EXISTS activity_starting_date DATE;

-- Add Allowed Water Abstraction (Section 5)
ALTER TABLE inspections 
ADD COLUMN IF NOT EXISTS allowed_quantity DECIMAL(15,2),
ADD COLUMN IF NOT EXISTS allowed_unit VARCHAR(20),
ADD COLUMN IF NOT EXISTS authorized_abstraction_method TEXT;

-- Add Actual Water Abstraction (Section 6)
ALTER TABLE inspections 
ADD COLUMN IF NOT EXISTS actual_quantity DECIMAL(15,2),
ADD COLUMN IF NOT EXISTS actual_unit VARCHAR(20),
ADD COLUMN IF NOT EXISTS actual_abstraction_method TEXT,
ADD COLUMN IF NOT EXISTS measurement_device_type TEXT,
ADD COLUMN IF NOT EXISTS measurement_device_notes TEXT,
ADD COLUMN IF NOT EXISTS measurement_device_photo_taken BOOLEAN DEFAULT FALSE;

-- Add Wastewater Management System (Section 7)
ALTER TABLE inspections 
ADD COLUMN IF NOT EXISTS wastewater_system_type TEXT,
ADD COLUMN IF NOT EXISTS wastewater_system_effectiveness VARCHAR(50),
ADD COLUMN IF NOT EXISTS wastewater_system_photos_taken BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS wastewater_notes TEXT;

-- Add Fees Payment Verification (Section 8)
ALTER TABLE inspections 
ADD COLUMN IF NOT EXISTS fees_payment_verified BOOLEAN,
ADD COLUMN IF NOT EXISTS fees_payment_amount DECIMAL(15,2),
ADD COLUMN IF NOT EXISTS fees_payment_proof TEXT,
ADD COLUMN IF NOT EXISTS fees_outstanding_amount DECIMAL(15,2);

-- Add Reports Submission (Section 9)
ALTER TABLE inspections 
ADD COLUMN IF NOT EXISTS reports_submitted BOOLEAN,
ADD COLUMN IF NOT EXISTS reports_submission_date DATE,
ADD COLUMN IF NOT EXISTS reports_reference_number TEXT,
ADD COLUMN IF NOT EXISTS reports_proof TEXT;

-- Add Water Use Conflicts (Section 10)
ALTER TABLE inspections 
ADD COLUMN IF NOT EXISTS water_use_conflicts TEXT,
ADD COLUMN IF NOT EXISTS conflict_severity VARCHAR(50);

-- Add Catchment Protection Initiatives (Section 11)
ALTER TABLE inspections 
ADD COLUMN IF NOT EXISTS catchment_protection_initiatives TEXT,
ADD COLUMN IF NOT EXISTS protection_photos_taken BOOLEAN DEFAULT FALSE;

-- Add Overall Assessment fields (Section 12)
ALTER TABLE inspections 
ADD COLUMN IF NOT EXISTS general_conclusion TEXT,
ADD COLUMN IF NOT EXISTS compliance_status VARCHAR(50);

-- Add comments for documentation
COMMENT ON COLUMN inspections.activity_type IS 'Type of activity for which water is used (from permit holder)';
COMMENT ON COLUMN inspections.activity_starting_date IS 'Date when the water use activity started';
COMMENT ON COLUMN inspections.allowed_quantity IS 'Allowed water abstraction quantity as per permit';
COMMENT ON COLUMN inspections.allowed_unit IS 'Unit for allowed water abstraction (m3/day, liters/hour, etc.)';
COMMENT ON COLUMN inspections.authorized_abstraction_method IS 'Method of water abstraction authorized in the permit';
COMMENT ON COLUMN inspections.actual_quantity IS 'Actual water abstracted/surface area covered during inspection';
COMMENT ON COLUMN inspections.actual_unit IS 'Unit for actual water abstraction';
COMMENT ON COLUMN inspections.actual_abstraction_method IS 'Actual abstraction method observed during inspection';
COMMENT ON COLUMN inspections.measurement_device_type IS 'Type of water measurement device in place';
COMMENT ON COLUMN inspections.measurement_device_notes IS 'Notes about measurement device condition and readings';
COMMENT ON COLUMN inspections.wastewater_system_type IS 'Type of wastewater management system in place';
COMMENT ON COLUMN inspections.wastewater_system_effectiveness IS 'Effectiveness rating of the wastewater system';
COMMENT ON COLUMN inspections.fees_payment_verified IS 'Whether permit fees payment was verified during inspection';
COMMENT ON COLUMN inspections.fees_payment_amount IS 'Amount paid for permit fees';
COMMENT ON COLUMN inspections.fees_outstanding_amount IS 'Amount not yet paid if fees are outstanding';
COMMENT ON COLUMN inspections.reports_submitted IS 'Whether required reports have been submitted';
COMMENT ON COLUMN inspections.reports_submission_date IS 'Date when reports were submitted';
COMMENT ON COLUMN inspections.reports_reference_number IS 'Reference number for submitted reports';
COMMENT ON COLUMN inspections.water_use_conflicts IS 'Description of any water use conflicts in the area';
COMMENT ON COLUMN inspections.conflict_severity IS 'Severity level of water use conflicts (low, medium, high)';
COMMENT ON COLUMN inspections.catchment_protection_initiatives IS 'Description of initiatives by water user to protect the catchment';
COMMENT ON COLUMN inspections.general_conclusion IS 'General conclusion and overall assessment of the inspection';
COMMENT ON COLUMN inspections.compliance_status IS 'Overall compliance status (compliant, minor_issues, major_issues, non_compliant)';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_inspections_compliance_status ON inspections(compliance_status);
CREATE INDEX IF NOT EXISTS idx_inspections_fees_verified ON inspections(fees_payment_verified);
CREATE INDEX IF NOT EXISTS idx_inspections_reports_submitted ON inspections(reports_submitted);

-- Update the updated_at trigger if needed
-- (assuming you have a trigger function to update the updated_at field)

COMMENT ON TABLE inspections IS 'Comprehensive inspection records for permit holders with 12-section checklist template';

