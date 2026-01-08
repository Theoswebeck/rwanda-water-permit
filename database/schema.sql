-- =============================================
-- Rwanda Water Resources Board (RWB) Water Permit System
-- Comprehensive PostgreSQL Schema
-- =============================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- =============================================
-- ENUMS AND TYPES
-- =============================================

-- User roles and statuses
CREATE TYPE user_role AS ENUM ('applicant', 'reviewer', 'inspector', 'admin', 'approver');
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended');
CREATE TYPE account_type AS ENUM ('individual', 'company');
CREATE TYPE id_type AS ENUM ('national_id', 'passport', 'driving_license');

-- Application related enums
CREATE TYPE application_status AS ENUM (
    'draft', 'submitted', 'under_review', 'pending_inspection', 
    'approved', 'approved_pending_permit', 'rejected', 'revision_required', 'cancelled'
);
CREATE TYPE application_type AS ENUM (
    'domestic', 'industrial', 'agricultural', 'commercial', 
    'municipal', 'mining_water_use'
);
CREATE TYPE water_source_type AS ENUM (
    'borehole', 'surface_water', 'river', 'groundwater', 
    'lake', 'spring', 'other'
);
CREATE TYPE water_purpose AS ENUM (
    'domestic', 'irrigation', 'industrial', 'livestock', 
    'aquaculture', 'recreation', 'electricity_generation', 
    'mining', 'municipal_supply', 'other'
);
CREATE TYPE sla_status AS ENUM ('on_time', 'due_soon', 'overdue');

-- Permit related enums
CREATE TYPE permit_status AS ENUM ('active', 'expired', 'expiring_soon', 'suspended', 'revoked');

-- Document related enums
CREATE TYPE document_type AS ENUM (
    'payment_proof', 'identification_doc', 'land_ownership_doc', 
    'technical_drawings', 'environmental_impact_doc', 'intake_discharge_map',
    'water_quality_report', 'geological_survey', 'business_license',
    'other'
);
CREATE TYPE verification_status AS ENUM ('pending', 'verified', 'rejected');

-- Inspection related enums
CREATE TYPE inspection_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');
CREATE TYPE inspection_type AS ENUM ('initial', 'follow_up', 'annual', 'complaint', 'renewal');
CREATE TYPE inspection_result AS ENUM ('passed', 'failed', 'conditional');

-- Review related enums
CREATE TYPE risk_assessment AS ENUM ('low', 'medium', 'high');
CREATE TYPE recommendation_type AS ENUM ('approve', 'reject', 'require_revision', 'require_inspection');

-- Rwanda administrative divisions
CREATE TYPE province_type AS ENUM ('Kigali', 'Northern', 'Southern', 'Eastern', 'Western');

-- =============================================
-- CORE TABLES
-- =============================================

-- Users table with comprehensive profile information
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    role user_role NOT NULL DEFAULT 'applicant',
    status user_status NOT NULL DEFAULT 'active',
    account_type account_type NOT NULL,
    
    -- Individual fields
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    date_of_birth DATE,
    id_number VARCHAR(50),
    id_type id_type,
    
    -- Company fields
    company_name VARCHAR(255),
    company_tin VARCHAR(50),
    company_address TEXT,
    company_phone VARCHAR(20),
    
    -- Location information
    province province_type,
    district VARCHAR(100),
    sector VARCHAR(100),
    cell VARCHAR(100),
    village VARCHAR(100),
    address TEXT,
    
    -- Activity tracking
    applications_count INTEGER DEFAULT 0,
    reviews_count INTEGER DEFAULT 0,
    inspections_count INTEGER DEFAULT 0,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE,
    
    -- Profile completion
    profile_completed BOOLEAN DEFAULT FALSE,
    
    CONSTRAINT chk_individual_fields CHECK (
        (account_type = 'individual' AND first_name IS NOT NULL AND last_name IS NOT NULL)
        OR account_type = 'company'
    ),
    CONSTRAINT chk_company_fields CHECK (
        (account_type = 'company' AND company_name IS NOT NULL)
        OR account_type = 'individual'
    )
);

-- Applications table with comprehensive form fields
CREATE TABLE applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    applicant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Application metadata
    application_number VARCHAR(50) UNIQUE,
    status application_status NOT NULL DEFAULT 'draft',
    application_type application_type NOT NULL,
    
    -- Water permit details
    water_source water_source_type NOT NULL,
    water_purpose water_purpose NOT NULL,
    estimated_usage_volume DECIMAL(15,2),
    usage_unit VARCHAR(20), -- m³, liters, etc.
    
    -- Location details (with spatial data)
    province province_type NOT NULL,
    district VARCHAR(100) NOT NULL,
    sector VARCHAR(100) NOT NULL,
    cell VARCHAR(100) NOT NULL,
    village VARCHAR(100),
    coordinates GEOMETRY(POINT, 4326), -- GPS coordinates
    location_description TEXT,
    
    -- Project information
    project_title VARCHAR(255) NOT NULL,
    project_description TEXT,
    project_value DECIMAL(15,2),
    
    -- Technical specifications
    water_taking_method VARCHAR(255),
    water_measuring_method VARCHAR(255),
    storage_facilities TEXT,
    return_flow_description TEXT,
    
    -- Industry-specific fields
    electricity_generation_capacity VARCHAR(100),
    mining_operations_type VARCHAR(255),
    water_diversion_details TEXT,
    
    -- Infrastructure details
    infrastructure_pipes TEXT,
    infrastructure_pumps TEXT,
    infrastructure_valves TEXT,
    infrastructure_meters TEXT,
    
    -- Environmental information
    environmental_assessment TEXT,
    mitigation_actions TEXT,
    
    -- Assignment tracking
    assigned_reviewer_id UUID REFERENCES users(id),
    assigned_inspector_id UUID REFERENCES users(id),
    assigned_approver_id UUID REFERENCES users(id),
    
    -- SLA tracking
    sla_status sla_status DEFAULT 'on_time',
    due_date TIMESTAMP WITH TIME ZONE,
    
    -- Workflow timestamps
    submitted_at TIMESTAMP WITH TIME ZONE,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    inspected_at TIMESTAMP WITH TIME ZONE,
    approved_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Terms & Conditions tracking
    terms_presented_at TIMESTAMP WITH TIME ZONE,
    terms_accepted_at TIMESTAMP WITH TIME ZONE,
    terms_status VARCHAR(50), -- 'pending', 'accepted', 'rejected'
    
    -- Additional metadata
    revision_notes TEXT,
    rejection_reason TEXT,
    internal_notes TEXT
);

-- Inspections table with detailed verification sections
CREATE TABLE inspections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    inspector_id UUID NOT NULL REFERENCES users(id),
    
    -- Inspection metadata
    inspection_number VARCHAR(50) UNIQUE,
    type inspection_type NOT NULL,
    status inspection_status NOT NULL DEFAULT 'scheduled',
    result inspection_result,
    
    -- Scheduling
    scheduled_date TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_date TIMESTAMP WITH TIME ZONE,
    
    -- Location verification
    location_verified BOOLEAN,
    coordinates_verified BOOLEAN,
    site_plan_compliance BOOLEAN,
    location_notes TEXT,
    
    -- Technical verification
    water_source_verified BOOLEAN,
    extraction_method_verified BOOLEAN,
    infrastructure_condition VARCHAR(100),
    technical_compliance BOOLEAN,
    technical_notes TEXT,
    
    -- Environmental compliance
    environmental_impact_assessed BOOLEAN,
    mitigation_measures_implemented BOOLEAN,
    environmental_compliance BOOLEAN,
    environmental_notes TEXT,
    
    -- Regulatory compliance
    permit_conditions_met BOOLEAN,
    volume_limits_respected BOOLEAN,
    reporting_up_to_date BOOLEAN,
    fees_paid BOOLEAN,
    regulatory_compliance BOOLEAN,
    regulatory_notes TEXT,
    
    -- Evidence collection
    photos_taken INTEGER DEFAULT 0,
    samples_collected INTEGER DEFAULT 0,
    gps_data JSONB,
    
    -- Inspector findings
    overall_score DECIMAL(3,2), -- 0.00 to 10.00
    recommendations TEXT,
    follow_up_required BOOLEAN DEFAULT FALSE,
    follow_up_date DATE,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Permits table
CREATE TABLE permits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    permit_number VARCHAR(50) UNIQUE NOT NULL,
    
    -- Permit details
    status permit_status NOT NULL DEFAULT 'active',
    water_source water_source_type NOT NULL,
    purpose water_purpose NOT NULL,
    water_allowance DECIMAL(15,2) NOT NULL,
    allowance_unit VARCHAR(20) NOT NULL,
    
    -- Authority and validity
    issuing_authority VARCHAR(255) NOT NULL DEFAULT 'Rwanda Water Resources Board',
    issued_date DATE NOT NULL,
    expiry_date DATE NOT NULL,
    
    -- Conditions and restrictions
    conditions JSONB, -- Array of permit conditions
    
    -- Transfer and renewal history
    original_permit_id UUID REFERENCES permits(id),
    is_renewal BOOLEAN DEFAULT FALSE,
    is_transfer BOOLEAN DEFAULT FALSE,
    transfer_reason TEXT,
    
    -- Monitoring requirements
    monitoring_frequency VARCHAR(100),
    reporting_requirements TEXT,
    
    -- Digital Document
    permit_pdf_url VARCHAR(500), -- URL/path to generated PDF permit
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Documents table with metadata and verification
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
    permit_id UUID REFERENCES permits(id) ON DELETE CASCADE,
    inspection_id UUID REFERENCES inspections(id) ON DELETE CASCADE,
    
    -- Document details
    name VARCHAR(255) NOT NULL,
    type document_type NOT NULL,
    file_path VARCHAR(500),
    file_size BIGINT,
    mime_type VARCHAR(100),
    
    -- Verification
    verification_status verification_status DEFAULT 'pending',
    verified_by UUID REFERENCES users(id),
    verified_at TIMESTAMP WITH TIME ZONE,
    verification_notes TEXT,
    
    -- Requirements
    is_required BOOLEAN DEFAULT TRUE,
    
    -- Upload information
    uploaded_by UUID NOT NULL REFERENCES users(id),
    upload_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);



-- Reviews table for tracking review workflow
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES users(id),
    
    -- Review details
    review_stage VARCHAR(50) NOT NULL, -- 'initial', 'technical', 'environmental', 'final'
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'escalated'
    
    -- Assessment
    risk_assessment risk_assessment,
    recommendation recommendation_type,
    
    -- Review content
    technical_review TEXT,
    environmental_review TEXT,
    compliance_review TEXT,
    overall_comments TEXT,
    
    -- Decision timeline
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    due_date TIMESTAMP WITH TIME ZONE,
    
    -- Quality metrics
    quality_score DECIMAL(3,2),
    processing_time_hours INTEGER,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Final approvals table
CREATE TABLE approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    approver_id UUID NOT NULL REFERENCES users(id),
    
    -- Approval details
    decision VARCHAR(50) NOT NULL, -- 'approved', 'rejected', 'conditional'
    decision_reason TEXT,
    conditions JSONB, -- Array of approval conditions
    
    -- Delegation
    delegated_from UUID REFERENCES users(id),
    delegation_reason TEXT,
    
    -- Timeline
    approved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    effective_date DATE,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Workflow history for tracking all application state changes
CREATE TABLE workflow_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    
    -- Change details
    from_status VARCHAR(50),
    to_status VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    comment TEXT,
    
    -- Metadata
    ip_address INET,
    user_agent TEXT,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Communications/Comments table
CREATE TABLE communications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
    inspection_id UUID REFERENCES inspections(id) ON DELETE CASCADE,
    
    -- Communication details
    sender_id UUID NOT NULL REFERENCES users(id),
    recipient_id UUID REFERENCES users(id),
    message_type VARCHAR(50) NOT NULL, -- 'comment', 'request_info', 'notification'
    subject VARCHAR(255),
    message TEXT NOT NULL,
    
    -- Status
    is_internal BOOLEAN DEFAULT FALSE,
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notifications table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Notification details
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'info', 'warning', 'success', 'error'
    
    -- Related entities
    application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
    inspection_id UUID REFERENCES inspections(id) ON DELETE CASCADE,
    
    -- Status
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    
    -- Delivery settings
    email_sent BOOLEAN DEFAULT FALSE,
    sms_sent BOOLEAN DEFAULT FALSE,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- System settings and configuration
CREATE TABLE system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(255) UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    category VARCHAR(100),
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User preferences and settings
CREATE TABLE user_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Notification preferences
    email_notifications BOOLEAN DEFAULT TRUE,
    sms_notifications BOOLEAN DEFAULT FALSE,
    application_updates BOOLEAN DEFAULT TRUE,
    inspection_reminders BOOLEAN DEFAULT TRUE,
    system_announcements BOOLEAN DEFAULT TRUE,
    
    -- UI preferences
    theme VARCHAR(20) DEFAULT 'light', -- 'light', 'dark', 'auto'
    language VARCHAR(10) DEFAULT 'en', -- 'en', 'fr', 'rw'
    timezone VARCHAR(50) DEFAULT 'Africa/Kigali',
    
    -- Dashboard preferences
    dashboard_layout JSONB,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id)
);

-- Audit log for security and compliance
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    
    -- Action details
    action VARCHAR(100) NOT NULL,
    table_name VARCHAR(100),
    record_id UUID,
    old_values JSONB,
    new_values JSONB,
    
    -- Request details
    ip_address INET,
    user_agent TEXT,
    request_id VARCHAR(100),
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

-- Users indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_account_type ON users(account_type);

-- Applications indexes
CREATE INDEX idx_applications_applicant ON applications(applicant_id);
CREATE INDEX idx_applications_status ON applications(status);
CREATE INDEX idx_applications_type ON applications(application_type);
CREATE INDEX idx_applications_number ON applications(application_number);
CREATE INDEX idx_applications_submitted_at ON applications(submitted_at);
CREATE INDEX idx_applications_coordinates ON applications USING GIST(coordinates);
CREATE INDEX idx_applications_sla_status ON applications(sla_status);
CREATE INDEX idx_applications_assigned_reviewer ON applications(assigned_reviewer_id);
CREATE INDEX idx_applications_assigned_inspector ON applications(assigned_inspector_id);

-- Permits indexes
CREATE INDEX idx_permits_application ON permits(application_id);
CREATE INDEX idx_permits_number ON permits(permit_number);
CREATE INDEX idx_permits_status ON permits(status);
CREATE INDEX idx_permits_expiry_date ON permits(expiry_date);

-- Documents indexes
CREATE INDEX idx_documents_application ON documents(application_id);
CREATE INDEX idx_documents_type ON documents(type);
CREATE INDEX idx_documents_verification_status ON documents(verification_status);

-- Inspections indexes
CREATE INDEX idx_inspections_application ON inspections(application_id);
CREATE INDEX idx_inspections_inspector ON inspections(inspector_id);
CREATE INDEX idx_inspections_status ON inspections(status);
CREATE INDEX idx_inspections_scheduled_date ON inspections(scheduled_date);

-- Reviews indexes
CREATE INDEX idx_reviews_application ON reviews(application_id);
CREATE INDEX idx_reviews_reviewer ON reviews(reviewer_id);
CREATE INDEX idx_reviews_status ON reviews(status);

-- Workflow history indexes
CREATE INDEX idx_workflow_history_application ON workflow_history(application_id);
CREATE INDEX idx_workflow_history_created_at ON workflow_history(created_at);

-- Communications indexes
CREATE INDEX idx_communications_application ON communications(application_id);
CREATE INDEX idx_communications_sender ON communications(sender_id);
CREATE INDEX idx_communications_recipient ON communications(recipient_id);

-- Notifications indexes
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

-- Audit logs indexes
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- =============================================
-- TRIGGERS FOR AUTOMATIC UPDATES
-- =============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER trigger_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_applications_updated_at
    BEFORE UPDATE ON applications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_permits_updated_at
    BEFORE UPDATE ON permits
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_inspections_updated_at
    BEFORE UPDATE ON inspections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_reviews_updated_at
    BEFORE UPDATE ON reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_communications_updated_at
    BEFORE UPDATE ON communications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_notifications_updated_at
    BEFORE UPDATE ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to generate application numbers
CREATE OR REPLACE FUNCTION generate_application_number()
RETURNS TRIGGER AS $$
DECLARE
    year_prefix VARCHAR(4);
    counter INTEGER;
    new_number VARCHAR(50);
BEGIN
    IF NEW.application_number IS NULL THEN
        year_prefix := EXTRACT(YEAR FROM NOW())::VARCHAR;
        
        SELECT COALESCE(MAX(CAST(SUBSTRING(application_number FROM 9) AS INTEGER)), 0) + 1
        INTO counter
        FROM applications
        WHERE application_number LIKE 'RWB-' || year_prefix || '-%';
        
        new_number := 'RWB-' || year_prefix || '-' || LPAD(counter::VARCHAR, 6, '0');
        NEW.application_number := new_number;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_generate_application_number
    BEFORE INSERT ON applications
    FOR EACH ROW
    EXECUTE FUNCTION generate_application_number();

-- Function to generate permit numbers
CREATE OR REPLACE FUNCTION generate_permit_number()
RETURNS TRIGGER AS $$
DECLARE
    year_prefix VARCHAR(4);
    counter INTEGER;
    new_number VARCHAR(50);
BEGIN
    IF NEW.permit_number IS NULL THEN
        year_prefix := EXTRACT(YEAR FROM NOW())::VARCHAR;
        
        SELECT COALESCE(MAX(CAST(SUBSTRING(permit_number FROM 11) AS INTEGER)), 0) + 1
        INTO counter
        FROM permits
        WHERE permit_number LIKE 'RWBP-' || year_prefix || '-%';
        
        new_number := 'RWBP-' || year_prefix || '-' || LPAD(counter::VARCHAR, 6, '0');
        NEW.permit_number := new_number;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_generate_permit_number
    BEFORE INSERT ON permits
    FOR EACH ROW
    EXECUTE FUNCTION generate_permit_number();

-- Function to update user activity counts
CREATE OR REPLACE FUNCTION update_user_activity_counts()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_TABLE_NAME = 'applications' THEN
        UPDATE users 
        SET applications_count = (SELECT COUNT(*) FROM applications WHERE applicant_id = NEW.applicant_id)
        WHERE id = NEW.applicant_id;
    ELSIF TG_TABLE_NAME = 'reviews' THEN
        UPDATE users 
        SET reviews_count = (SELECT COUNT(*) FROM reviews WHERE reviewer_id = NEW.reviewer_id)
        WHERE id = NEW.reviewer_id;
    ELSIF TG_TABLE_NAME = 'inspections' THEN
        UPDATE users 
        SET inspections_count = (SELECT COUNT(*) FROM inspections WHERE inspector_id = NEW.inspector_id)
        WHERE id = NEW.inspector_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_application_count
    AFTER INSERT ON applications
    FOR EACH ROW
    EXECUTE FUNCTION update_user_activity_counts();

CREATE TRIGGER trigger_update_review_count
    AFTER INSERT ON reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_user_activity_counts();

CREATE TRIGGER trigger_update_inspection_count
    AFTER INSERT ON inspections
    FOR EACH ROW
    EXECUTE FUNCTION update_user_activity_counts();

-- =============================================
-- ROW LEVEL SECURITY (RLS) POLICIES FOR SUPABASE
-- =============================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view their own profile"
    ON users FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
    ON users FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Admins can view all users"
    ON users FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Applications policies
CREATE POLICY "Users can view their own applications"
    ON applications FOR SELECT
    USING (auth.uid() = applicant_id);

CREATE POLICY "Users can create their own applications"
    ON applications FOR INSERT
    WITH CHECK (auth.uid() = applicant_id);

-- Drop existing policy and recreate with updated logic
DROP POLICY IF EXISTS "Users can update their own draft applications" ON applications;

CREATE POLICY "Users can update their own draft applications"
    ON applications FOR UPDATE
    USING (auth.uid() = applicant_id AND status IN ('draft', 'revision_required') AND status NOT IN ('approved', 'rejected'));

CREATE POLICY "Reviewers can view assigned applications"
    ON applications FOR SELECT
    USING (
        auth.uid() = assigned_reviewer_id OR
        auth.uid() = assigned_assessor_id OR
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role IN ('reviewer', 'assessor', 'admin')
        )
    );

CREATE POLICY "Inspectors can view assigned applications"
    ON applications FOR SELECT
    USING (
        auth.uid() = assigned_inspector_id OR
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role IN ('inspector', 'admin')
        )
    );

-- Drop existing policy and recreate with updated logic
DROP POLICY IF EXISTS "Staff can update applications in their workflow" ON applications;

CREATE POLICY "Staff can update applications in their workflow"
    ON applications FOR UPDATE
    USING (
        (auth.uid() = assigned_reviewer_id OR
         auth.uid() = assigned_inspector_id OR
         auth.uid() = assigned_assessor_id OR
         auth.uid() = assigned_approver_id OR
         EXISTS (
             SELECT 1 FROM users 
             WHERE id = auth.uid() AND role = 'admin'
         )) AND
        status NOT IN ('approved', 'rejected')
    );

-- Permits policies
CREATE POLICY "Users can view permits for their applications"
    ON permits FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM applications 
            WHERE id = permits.application_id AND applicant_id = auth.uid()
        )
    );

CREATE POLICY "Staff can view all permits"
    ON permits FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role IN ('reviewer', 'inspector', 'admin', 'approver')
        )
    );

-- Documents policies
CREATE POLICY "Users can manage documents for their applications"
    ON documents FOR ALL
    USING (
        application_id IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM applications 
            WHERE id = documents.application_id AND applicant_id = auth.uid()
        )
    );

CREATE POLICY "Staff can view all documents"
    ON documents FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role IN ('reviewer', 'inspector', 'admin', 'approver')
        )
    );

-- Inspections policies
CREATE POLICY "Inspectors can manage their inspections"
    ON inspections FOR ALL
    USING (auth.uid() = inspector_id);

CREATE POLICY "Users can view inspections for their applications"
    ON inspections FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM applications 
            WHERE id = inspections.application_id AND applicant_id = auth.uid()
        )
    );

-- Reviews policies
CREATE POLICY "Reviewers can manage their reviews"
    ON reviews FOR ALL
    USING (auth.uid() = reviewer_id);

-- Notifications policies
CREATE POLICY "Users can manage their own notifications"
    ON notifications FOR ALL
    USING (auth.uid() = user_id);

-- User preferences policies
CREATE POLICY "Users can manage their own preferences"
    ON user_preferences FOR ALL
    USING (auth.uid() = user_id);

-- =============================================
-- SAMPLE DATA FOR DEVELOPMENT
-- =============================================

-- Insert default system settings
INSERT INTO system_settings (key, value, description, category) VALUES
('application_timeout_days', '30', 'Number of days before application times out', 'workflow'),
('permit_renewal_notice_days', '90', 'Days before permit expiry to send renewal notice', 'permits'),
('max_file_size_mb', '10', 'Maximum file upload size in MB', 'uploads'),
('supported_file_types', '["pdf", "doc", "docx", "jpg", "jpeg", "png"]', 'Supported file types for uploads', 'uploads'),
('email_notifications_enabled', 'true', 'Enable email notifications system-wide', 'notifications'),
('sms_notifications_enabled', 'false', 'Enable SMS notifications system-wide', 'notifications'),
('maintenance_mode', 'false', 'Enable maintenance mode', 'system'),
('password_min_length', '8', 'Minimum password length', 'security'),
('session_timeout_minutes', '60', 'Session timeout in minutes', 'security');

-- Rwanda Water Resources Board Water Permit Management System Database
-- Schema successfully applied! 