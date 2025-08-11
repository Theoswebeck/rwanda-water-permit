-- =============================================
-- Rwanda Water Board (RWB) Water Permit System
-- Supabase Migration - Initial Schema
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
-- Note: This extends Supabase auth.users with application-specific data
CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
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
CREATE TABLE public.applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    applicant_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    
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
    assigned_reviewer_id UUID REFERENCES public.users(id),
    assigned_inspector_id UUID REFERENCES public.users(id),
    assigned_approver_id UUID REFERENCES public.users(id),
    
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

-- Continue with all other tables from the main schema...
-- (Copy the rest of the tables from schema.sql but with public. prefix)

-- Permits table
CREATE TABLE public.permits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
    permit_number VARCHAR(50) UNIQUE NOT NULL,
    
    -- Permit details
    status permit_status NOT NULL DEFAULT 'active',
    water_source water_source_type NOT NULL,
    purpose water_purpose NOT NULL,
    water_allowance DECIMAL(15,2) NOT NULL,
    allowance_unit VARCHAR(20) NOT NULL,
    
    -- Authority and validity
    issuing_authority VARCHAR(255) NOT NULL DEFAULT 'Rwanda Water Board',
    issued_date DATE NOT NULL,
    expiry_date DATE NOT NULL,
    
    -- Conditions and restrictions
    conditions JSONB, -- Array of permit conditions
    
    -- Transfer and renewal history
    original_permit_id UUID REFERENCES public.permits(id),
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

-- Documents table
CREATE TABLE public.documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID REFERENCES public.applications(id) ON DELETE CASCADE,
    permit_id UUID REFERENCES public.permits(id) ON DELETE CASCADE,
    inspection_id UUID REFERENCES public.inspections(id) ON DELETE CASCADE,
    
    -- Document details
    name VARCHAR(255) NOT NULL,
    type document_type NOT NULL,
    file_path VARCHAR(500),
    file_size BIGINT,
    mime_type VARCHAR(100),
    
    -- Verification
    verification_status verification_status DEFAULT 'pending',
    verified_by UUID REFERENCES public.users(id),
    verified_at TIMESTAMP WITH TIME ZONE,
    verification_notes TEXT,
    
    -- Requirements
    is_required BOOLEAN DEFAULT TRUE,
    
    -- Upload information
    uploaded_by UUID NOT NULL REFERENCES public.users(id),
    upload_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Inspections table
CREATE TABLE public.inspections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
    inspector_id UUID NOT NULL REFERENCES public.users(id),
    
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

-- Reviews table
CREATE TABLE public.reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES public.users(id),
    
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

-- Approvals table
CREATE TABLE public.approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
    approver_id UUID NOT NULL REFERENCES public.users(id),
    
    -- Approval details
    decision VARCHAR(50) NOT NULL, -- 'approved', 'rejected', 'conditional'
    decision_reason TEXT,
    conditions JSONB, -- Array of approval conditions
    
    -- Delegation
    delegated_from UUID REFERENCES public.users(id),
    delegation_reason TEXT,
    
    -- Timeline
    approved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    effective_date DATE,
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Workflow history table
CREATE TABLE public.workflow_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id),
    
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

-- Communications table
CREATE TABLE public.communications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID REFERENCES public.applications(id) ON DELETE CASCADE,
    inspection_id UUID REFERENCES public.inspections(id) ON DELETE CASCADE,
    
    -- Communication details
    sender_id UUID NOT NULL REFERENCES public.users(id),
    recipient_id UUID REFERENCES public.users(id),
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
CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    
    -- Notification details
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'info', 'warning', 'success', 'error'
    
    -- Related entities
    application_id UUID REFERENCES public.applications(id) ON DELETE CASCADE,
    inspection_id UUID REFERENCES public.inspections(id) ON DELETE CASCADE,
    
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

-- System settings table
CREATE TABLE public.system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(255) UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    category VARCHAR(100),
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User preferences table
CREATE TABLE public.user_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    
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

-- Audit logs table
CREATE TABLE public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id),
    
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
CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_users_role ON public.users(role);
CREATE INDEX idx_users_status ON public.users(status);
CREATE INDEX idx_users_account_type ON public.users(account_type);

-- Applications indexes
CREATE INDEX idx_applications_applicant ON public.applications(applicant_id);
CREATE INDEX idx_applications_status ON public.applications(status);
CREATE INDEX idx_applications_type ON public.applications(application_type);
CREATE INDEX idx_applications_number ON public.applications(application_number);
CREATE INDEX idx_applications_submitted_at ON public.applications(submitted_at);
CREATE INDEX idx_applications_coordinates ON public.applications USING GIST(coordinates);
CREATE INDEX idx_applications_sla_status ON public.applications(sla_status);
CREATE INDEX idx_applications_assigned_reviewer ON public.applications(assigned_reviewer_id);
CREATE INDEX idx_applications_assigned_inspector ON public.applications(assigned_inspector_id);

-- Other indexes...
CREATE INDEX idx_permits_application ON public.permits(application_id);
CREATE INDEX idx_permits_number ON public.permits(permit_number);
CREATE INDEX idx_permits_status ON public.permits(status);
CREATE INDEX idx_permits_expiry_date ON public.permits(expiry_date);

CREATE INDEX idx_documents_application ON public.documents(application_id);
CREATE INDEX idx_documents_type ON public.documents(type);
CREATE INDEX idx_documents_verification_status ON public.documents(verification_status);

CREATE INDEX idx_inspections_application ON public.inspections(application_id);
CREATE INDEX idx_inspections_inspector ON public.inspections(inspector_id);
CREATE INDEX idx_inspections_status ON public.inspections(status);
CREATE INDEX idx_inspections_scheduled_date ON public.inspections(scheduled_date);

CREATE INDEX idx_reviews_application ON public.reviews(application_id);
CREATE INDEX idx_reviews_reviewer ON public.reviews(reviewer_id);
CREATE INDEX idx_reviews_status ON public.reviews(status);

CREATE INDEX idx_workflow_history_application ON public.workflow_history(application_id);
CREATE INDEX idx_workflow_history_created_at ON public.workflow_history(created_at);

CREATE INDEX idx_communications_application ON public.communications(application_id);
CREATE INDEX idx_communications_sender ON public.communications(sender_id);
CREATE INDEX idx_communications_recipient ON public.communications(recipient_id);

CREATE INDEX idx_notifications_user ON public.notifications(user_id);
CREATE INDEX idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at);

CREATE INDEX idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at);

-- =============================================
-- TRIGGERS AND FUNCTIONS
-- =============================================

-- Include all trigger functions from the main schema...
-- (Copy all trigger functions and triggers from schema.sql)

-- Function to handle new user creation (Supabase specific)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, created_at, updated_at)
    VALUES (NEW.id, NEW.email, NOW(), NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create user profile when auth user is created
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Comprehensive RLS policies for Supabase auth integration
-- Users policies
CREATE POLICY "Users can view their own profile" ON public.users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.users
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can view all users" ON public.users
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Applications policies
CREATE POLICY "Users can view their own applications" ON public.applications
    FOR SELECT USING (auth.uid() = applicant_id);

CREATE POLICY "Users can create their own applications" ON public.applications
    FOR INSERT WITH CHECK (auth.uid() = applicant_id);

CREATE POLICY "Users can update their own draft applications" ON public.applications
    FOR UPDATE USING (auth.uid() = applicant_id AND status = 'draft');

CREATE POLICY "Reviewers can view assigned applications" ON public.applications
    FOR SELECT USING (
        auth.uid() = assigned_reviewer_id OR
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND role IN ('reviewer', 'admin')
        )
    );

CREATE POLICY "Inspectors can view assigned applications" ON public.applications
    FOR SELECT USING (
        auth.uid() = assigned_inspector_id OR
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND role IN ('inspector', 'admin')
        )
    );

CREATE POLICY "Staff can update applications in their workflow" ON public.applications
    FOR UPDATE USING (
        auth.uid() = assigned_reviewer_id OR
        auth.uid() = assigned_inspector_id OR
        auth.uid() = assigned_approver_id OR
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Similar policies for other tables...
-- (Copy all RLS policies from schema.sql)

-- =============================================
-- SEED DATA
-- =============================================

-- Insert default system settings
INSERT INTO public.system_settings (key, value, description, category) VALUES
('application_timeout_days', '30', 'Number of days before application times out', 'workflow'),
('permit_renewal_notice_days', '90', 'Days before permit expiry to send renewal notice', 'permits'),
('max_file_size_mb', '10', 'Maximum file upload size in MB', 'uploads'),
('supported_file_types', '["pdf", "doc", "docx", "jpg", "jpeg", "png"]', 'Supported file types for uploads', 'uploads'),
('email_notifications_enabled', 'true', 'Enable email notifications system-wide', 'notifications'),
('sms_notifications_enabled', 'false', 'Enable SMS notifications system-wide', 'notifications'),
('maintenance_mode', 'false', 'Enable maintenance mode', 'system'),
('password_min_length', '8', 'Minimum password length', 'security'),
('session_timeout_minutes', '60', 'Session timeout in minutes', 'security'); 