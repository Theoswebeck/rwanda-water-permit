// =============================================
// Rwanda Water Resources Board Database Types
// Generated from PostgreSQL Schema
// =============================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// =============================================
// ENUMS
// =============================================

export type UserRole = 'applicant' | 'assessor' | 'reviewer' | 'verifier' | 'inspector' | 'admin' | 'approver'
export type UserStatus = 'active' | 'inactive' | 'suspended'
export type AccountType = 'individual' | 'company' | 'cooperative' | 'organization' | 'institution'
export type IdType = 'national_id' | 'tin'

export type ApplicationStatus = 
  | 'draft' 
  | 'pending_payment'  // NEW: Application awaiting payment
  | 'submitted' 
  | 'under_review' 
  | 'pending_assessment'
  | 'pending_review'
  | 'pending_verification'
  | 'pending_final_approval'
  | 'approved' 
  | 'approved_pending_permit'
  | 'expired'
  | 'rejected' 
  | 'revision_required' 
  | 'cancelled'

export type ApplicationType = 
  | 'domestic' 
  | 'industrial' 
  | 'agricultural' 
  | 'commercial'
  | 'municipal' 
  | 'mining_water_use'
  | 'transfer'

export type WaterSourceType = 
  | 'borehole' 
  | 'surface_water' 
  | 'river' 
  | 'groundwater'
  | 'lake' 
  | 'spring'
  | 'dam'
  | 'stream'
  | 'swamp'
  | 'reservoir'
  | 'wetland'
  | 'hydropower_source'
  | 'other'

export type WaterPurpose = 
  | 'domestic' 
  | 'irrigation' 
  | 'industrial' 
  | 'livestock'
  // NOTE: DB enum migrated from 'aquaculture' to explicit fish-farming purposes.
  // Keep 'aquaculture' ONLY for legacy records / older environments.
  | 'aquaculture'
  | 'fish_farming_lakes'
  | 'fish_farming_ponds'
  | 'recreation' 
  | 'electricity_generation'
  | 'mining' 
  | 'municipal_supply' 
  | 'other'

export type WaterReliability = 'always_available' | 'frequently_dry' | 'seasonal_dry'

export type LandOwnershipStatus = 
  | 'own_all_land' 
  | 'recorded_easement' 
  | 'written_consent' 
  | 'lease_agreement' 
  | 'access_pending'

export type SlaStatus = 'on_time' | 'due_soon' | 'overdue'

export type PermitStatus = 'active' | 'expired' | 'expiring_soon' | 'suspended' | 'revoked'

export type DocumentType = 
  | 'payment_proof' 
  | 'identification_doc' 
  | 'land_ownership_doc'
  | 'land_access_doc' // Added for land access documents (easement, consent, lease, etc.)
  | 'technical_drawings' 
  | 'environmental_impact_doc' 
  | 'intake_discharge_map'
  | 'water_quality_report' 
  | 'geological_survey' 
  | 'business_license'
  | 'other'

export type VerificationStatus = 'pending' | 'verified' | 'rejected'

export type InspectionStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
export type InspectionType = 'initial' | 'follow_up' | 'annual' | 'complaint' | 'renewal'
export type InspectionResult = 'passed' | 'failed' | 'conditional'

export type RiskAssessment = 'low' | 'medium' | 'high'
export type RecommendationType = 'approve' | 'reject' | 'require_revision' | 'require_inspection'

export type ProvinceType = 'Kigali' | 'Northern' | 'Southern' | 'Eastern' | 'Western'

// =============================================
// WATER USE REPORTING (ANNUAL)
// =============================================

export type WaterUseReportTemplate = 'abstraction' | 'concession'
export type WaterUseReportStatus = 'draft' | 'submitted'

// =============================================
// MAIN INTERFACES
// =============================================

export interface User {
  id: string
  email: string
  phone?: string
  role: UserRole
  status: UserStatus
  account_type: AccountType
  
  // Personal information
  first_name?: string
  last_name?: string
  date_of_birth?: string
  id_number?: string
  id_type?: IdType
  
  // Company fields
  company_name?: string
  company_tin?: string
  company_address?: string
  company_phone?: string
  
  // Enhanced contact information (from schema update)
  po_box?: string
  mobile_phone?: string
  landline_phone?: string
  incorporation_certificate_number?: string
  alternative_contact?: Json // JSONB for alternative contact person details
  
  // Location information
  province?: ProvinceType
  district?: string
  sector?: string
  cell?: string
  village?: string
  address?: string
  
  // Activity tracking
  applications_count: number
  reviews_count: number
  inspections_count: number
  
  // Audit fields
  created_at: string
  updated_at: string
  last_login_at?: string
  
  // Profile completion
  profile_completed: boolean
  
  // Admin-invited staff password change flow
  must_change_password: boolean
  account_confirmed: boolean
  confirmed_at?: string | null
}

export interface Application {
  id: string
  applicant_id: string
  
  // Application metadata
  application_number?: string
  status: ApplicationStatus
  application_type: ApplicationType
  
  // Water permit details
  water_source: WaterSourceType
  water_purpose: WaterPurpose
  /**
   * Primary intended activities as stored by the application form (JSON array of activity codes).
   * Used to determine whether this application is abstraction vs concession (fish farming).
   */
  intended_activities?: string[] | null
  estimated_usage_volume?: number
  usage_unit?: string
  
  // Location details
  province: ProvinceType
  district: string
  sector: string
  cell: string
  village?: string
  coordinates?: Json // PostGIS geometry
  location_description?: string
  
  // Project information
  project_title: string
  project_description?: string
  project_value?: number
  
  // Technical specifications
  water_taking_method?: string
  water_measuring_method?: string
  storage_facilities?: string
  return_flow_description?: string
  
  // Industry-specific fields
  electricity_generation_capacity?: string
  mining_operations_type?: string
  water_diversion_details?: string
  
  // Infrastructure details
  infrastructure_pipes?: string
  infrastructure_pumps?: string
  infrastructure_valves?: string
  infrastructure_meters?: string
  
  // Environmental information
  environmental_assessment?: string
  mitigation_actions?: string
  
  // =============================================
  // NEW FIELDS FROM SCHEMA UPDATE
  // =============================================
  
  // Water Source Details (Section 7 of form)
  water_body_name?: string
  tributary_name?: string
  catchment_name_level_1?: string
  catchment_name_level_2?: string
  water_reliability?: WaterReliability
  natural_discharge_volume_m3?: number
  
  // Water Usage Breakdown (Section 8 of form)
  max_daily_volume_m3?: number
  max_monthly_volume_m3?: number
  max_yearly_volume_m3?: number
  flow_rate_m3_per_second?: number
  abstraction_facilities_description?: string
  return_flow_location?: string
  return_flow_volume_m3?: number
  proposed_duration_months?: number
  proposed_duration_years?: number
  pumping_hours_per_day?: number
  
  // Assessor recommended values (take precedence for permit/terms generation)
  assessor_recommended_volume_m3?: number
  
  // Project Details (Section 9 of form)
  proposed_facilities_description?: string
  construction_type?: string
  concession_area?: number // in hectares
  operational_overview?: string
  
  // Land Ownership Information (Section 11 of form)
  owns_all_required_land?: boolean
  land_ownership_status?: LandOwnershipStatus
  affected_landowners?: Json // JSONB array of landowner details
  easement_details?: string
  written_consent_details?: string
  lease_agreement_details?: string
  land_access_steps?: string
  
  // Assignment tracking
  assigned_reviewer_id?: string
  assigned_assessor_id?: string
  assigned_inspector_id?: string
  assigned_approver_id?: string
  assigned_verifier_id?: string
  
  // SLA tracking
  sla_status: SlaStatus
  due_date?: string
  
  // Workflow timestamps
  submitted_at?: string
  reviewed_at?: string
  inspected_at?: string
  approved_at?: string
  
  // Audit fields
  created_at: string
  updated_at: string
  
  // Additional metadata
  revision_notes?: string
  rejection_reason?: string
  internal_notes?: string
  
  // Joined relations (from Supabase queries with select joins)
  applicant?: any // User/applicant data when joined
  assigned_reviewer?: any
  assigned_assessor?: any
  assigned_inspector?: any
  assigned_approver?: any
  assigned_verifier?: any
  documents?: any[]
  payments?: any[]
}

export interface Permit {
  id: string
  application_id: string
  permit_number: string
  
  // Permit details
  status: PermitStatus
  water_source: WaterSourceType
  purpose: WaterPurpose
  water_allowance: number
  allowance_unit: string
  
  // Authority and validity
  issuing_authority: string
  issued_date: string
  expiry_date: string
  
  // Conditions and restrictions
  conditions?: Json
  
  // Transfer and renewal history
  original_permit_id?: string
  is_renewal: boolean
  is_transfer: boolean
  transfer_reason?: string
  
  // Monitoring requirements
  monitoring_frequency?: string
  reporting_requirements?: string

  // Digital Document
  // May be a Supabase Storage path (recommended) or a full URL.
  permit_pdf_url?: string | null
  
  // Audit fields
  created_at: string
  updated_at: string
}

export interface WaterUseReport {
  id: string

  // Relations
  permit_id: string
  application_id: string
  applicant_id: string

  // Core fields
  reporting_year: number
  template: WaterUseReportTemplate
  status: WaterUseReportStatus

  // Section payloads (user-editable portions)
  section3?: Json
  section3_quarterly?: Json
  section4?: Json
  section5_monitoring?: Json
  section5_incidents?: Json
  section6_employment?: Json
  section6_ohs?: Json
  section7?: Json
  section8?: Json
  section9_declaration?: Json

  // Audit
  submitted_at?: string | null
  created_at: string
  updated_at: string
}

export interface Document {
  id: string
  application_id?: string
  permit_id?: string
  inspection_id?: string
  
  // Document details
  name: string
  type: DocumentType
  file_path?: string
  file_size?: number
  mime_type?: string
  
  // Verification
  verification_status: VerificationStatus
  verified_by?: string
  verified_at?: string
  verification_notes?: string
  
  // Requirements
  is_required: boolean
  
  // Upload information
  uploaded_by: string
  upload_date: string
  
  // Audit fields
  created_at: string
  updated_at: string
}

export interface Inspection {
  id: string
  application_id: string
  inspector_id: string
  
  // Inspection metadata
  inspection_number?: string
  type: InspectionType
  status: InspectionStatus
  result?: InspectionResult

  // Reviewer workflow (optional)
  review_status?: 'pending' | 'reviewed' | 'changes_requested' | string
  review_notes?: string
  reviewed_by?: string
  reviewed_at?: string

  // Uploaded documents (JSONB)
  inspection_documents?: Json
  
  // Scheduling
  scheduled_date: string
  completed_date?: string

  // Template selector + locked fields
  inspection_template?: 'authorization' | 'concession'
  operator_name?: string
  operator_id_tin?: string
  operator_residence?: string
  catchment_level1?: string
  catchment_level2?: string
  
  // Location verification
  location_verified?: boolean
  coordinates_verified?: boolean
  site_plan_compliance?: boolean
  location_notes?: string
  
  // Technical verification
  water_source_verified?: boolean
  extraction_method_verified?: boolean
  infrastructure_condition?: string
  technical_compliance?: boolean
  technical_notes?: string
  
  // Environmental compliance
  environmental_impact_assessed?: boolean
  mitigation_measures_implemented?: boolean
  environmental_compliance?: boolean
  environmental_notes?: string
  
  // Regulatory compliance
  permit_conditions_met?: boolean
  volume_limits_respected?: boolean
  reporting_up_to_date?: boolean
  fees_paid?: boolean
  regulatory_compliance?: boolean
  regulatory_notes?: string
  
  // Evidence collection
  photos_taken: number
  samples_collected: number
  gps_data?: Json
  
  // Inspector findings
  overall_score?: number
  recommendations?: string
  follow_up_required: boolean
  follow_up_date?: string
  
  // Section 2: Activity Details
  activity_type?: string
  activity_starting_date?: string
  
  // Section 5: Allowed Water Abstraction
  allowed_quantity?: number
  allowed_unit?: string
  authorized_abstraction_method?: string
  
  // Section 6: Actual Water Abstraction
  actual_quantity?: number
  actual_unit?: string
  actual_abstraction_method?: string
  measurement_device_type?: string
  measurement_device_notes?: string
  measurement_device_photo_taken?: boolean
  
  // Section 7: Wastewater Management
  wastewater_system_type?: string
  wastewater_system_effectiveness?: string
  wastewater_system_photos_taken?: boolean
  wastewater_notes?: string
  
  // Section 8: Fees Payment Verification
  fees_payment_verified?: boolean
  fees_payment_amount?: number
  fees_payment_proof?: string
  fees_outstanding_amount?: number
  
  // Section 9: Reports Submission
  reports_submitted?: boolean
  reports_submission_date?: string
  reports_reference_number?: string
  reports_proof?: string
  
  // Section 10: Water Use Conflicts
  water_use_conflicts?: string
  conflict_severity?: string
  
  // Section 11: Catchment Protection Initiatives
  catchment_protection_initiatives?: string
  protection_photos_taken?: boolean
  
  // Section 12: Overall Assessment
  general_conclusion?: string
  compliance_status?: string

  // Concession-specific (template = concession)
  authorized_surface_area_ha?: number
  actual_surface_area_ha?: number
  authorized_concession_boundaries?: Json
  actual_concession_boundaries?: Json

  // Social/Gender + OHS
  employment_gender_breakdown?: Json
  ohs_gender_sensitive?: Json
  
  // Audit fields
  created_at: string
  updated_at: string
}

export interface Review {
  id: string
  application_id: string
  reviewer_id: string
  
  // Review details
  review_stage: string
  status: string
  
  // Assessment
  risk_assessment?: RiskAssessment
  recommendation?: RecommendationType
  
  // Review content
  technical_review?: string
  environmental_review?: string
  compliance_review?: string
  overall_comments?: string
  
  // Decision timeline
  assigned_at: string
  completed_at?: string
  due_date?: string
  
  // Quality metrics
  quality_score?: number
  processing_time_hours?: number
  
  // Audit fields
  created_at: string
  updated_at: string
}

export interface Assessment {
  id: string
  application_id: string
  inspector_id: string
  
  // Assessment details
  assessment_stage: string // 'technical', 'environmental', 'feasibility'
  status: string // 'pending', 'completed', 'escalated'
  
  // Technical Assessment
  technical_feasibility?: boolean
  technical_comments?: string
  site_accessibility?: boolean
  infrastructure_adequacy?: boolean
  
  // Environmental Assessment
  environmental_impact_level?: RiskAssessment
  environmental_comments?: string
  mitigation_required?: boolean
  
  // Water Source Assessment
  source_reliability?: boolean
  source_capacity_adequate?: boolean
  source_quality_acceptable?: boolean
  water_rights_clear?: boolean
  
  // Overall Assessment
  overall_recommendation?: RecommendationType
  conditions_required?: Json
  overall_comments?: string
  
  // Decision timeline
  assigned_at: string
  completed_at?: string
  due_date?: string
  
  // Quality metrics
  assessment_score?: number
  field_visit_required?: boolean
  field_visit_completed?: boolean
  field_visit_date?: string
  
  // Audit fields
  created_at: string
  updated_at: string
}

export interface Approval {
  id: string
  application_id: string
  approver_id: string
  
  // Approval details
  decision: string
  decision_reason?: string
  conditions?: Json
  
  // Delegation
  delegated_from?: string
  delegation_reason?: string
  
  // Timeline
  approved_at: string
  effective_date?: string
  
  // Audit fields
  created_at: string
  updated_at: string
}

export interface WorkflowHistory {
  id: string
  application_id: string
  user_id?: string
  
  // Change details
  from_status?: string
  to_status: string
  action: string
  comment?: string
  
  // Metadata
  ip_address?: string
  user_agent?: string
  
  // Audit fields
  created_at: string
}

export interface Communication {
  id: string
  application_id?: string
  inspection_id?: string
  
  // Communication details
  sender_id: string
  recipient_id?: string
  message_type: string
  subject?: string
  message: string
  
  // Status
  is_internal: boolean
  is_read: boolean
  read_at?: string
  
  // Audit fields
  created_at: string
  updated_at: string
}

export interface Notification {
  id: string
  user_id: string
  
  // Notification details
  title: string
  message: string
  type: string
  
  // Related entities
  application_id?: string
  inspection_id?: string
  
  // Status
  is_read: boolean
  read_at?: string
  
  // Delivery settings
  email_sent: boolean
  sms_sent: boolean
  
  // Audit fields
  created_at: string
  updated_at: string
}

export interface SystemSetting {
  id: string
  key: string
  value: Json
  description?: string
  category?: string
  
  // Audit fields
  created_at: string
  updated_at: string
}

export interface UserPreferences {
  id: string
  user_id: string
  
  // Notification preferences
  email_notifications: boolean
  sms_notifications: boolean
  application_updates: boolean
  inspection_reminders: boolean
  system_announcements: boolean
  
  // UI preferences
  theme: string
  language: string
  timezone: string
  
  // Dashboard preferences
  dashboard_layout?: Json
  
  // Audit fields
  created_at: string
  updated_at: string
}

export interface AuditLog {
  id: string
  user_id?: string
  
  // Action details
  action: string
  table_name?: string
  record_id?: string
  old_values?: Json
  new_values?: Json
  
  // Request details
  ip_address?: string
  user_agent?: string
  request_id?: string
  
  // Audit fields
  created_at: string
}

// =============================================
// HELPER TYPES AND INTERFACES
// =============================================

// For form inputs and API responses
export interface ApplicationFormData extends Omit<Application, 'id' | 'created_at' | 'updated_at' | 'applicant_id' | 'application_number' | 'status' | 'submitted_at' | 'reviewed_at' | 'inspected_at' | 'approved_at'> {
  // These fields will be set by the system
}

export interface ApplicationWithRelations extends Application {
  applicant?: User
  assigned_reviewer?: User
  assigned_inspector?: User
  assigned_approver?: User
  documents?: Document[]
  reviews?: Review[]
  assessments?: Assessment[]
  inspections?: Inspection[]
  permits?: Permit[]
  workflow_history?: WorkflowHistory[]
  communications?: Communication[]
}

export interface UserWithRelations extends User {
  applications?: Application[]
  reviews?: Review[]
  inspections?: Inspection[]
  approvals?: Approval[]
  preferences?: UserPreferences
}

export interface PermitWithRelations extends Permit {
  application?: Application
  documents?: Document[]
}

export interface InspectionWithRelations extends Inspection {
  application?: Application
  inspector?: User
  documents?: Document[]
}

// Dashboard and statistics types
export interface DashboardStats {
  total_applications: number
  pending_review: number
  pending_inspection: number
  approved_this_month: number
  active_permits: number
  expiring_permits: number
  overdue_applications: number
  user_applications?: number
}

export interface ApplicationStats {
  by_status: Record<ApplicationStatus, number>
  by_type: Record<ApplicationType, number>
  by_province: Record<ProvinceType, number>
  processing_times: {
    average_days: number
    median_days: number
    fastest_days: number
    slowest_days: number
  }
}

// Search and filter types
export interface ApplicationFilters {
  status?: ApplicationStatus[]
  type?: ApplicationType[]
  province?: ProvinceType[]
  district?: string[]
  water_source?: WaterSourceType[]
  sla_status?: SlaStatus[]
  assigned_reviewer_id?: string
  assigned_assessor_id?: string
  assigned_inspector_id?: string
  date_range?: {
    from: string
    to: string
  }
}

export interface SearchParams {
  query?: string
  filters?: ApplicationFilters
  sort_by?: string
  sort_order?: 'asc' | 'desc'
  page?: number
  limit?: number
}

// API response types
export interface ApiResponse<T> {
  data: T
  message?: string
  status: 'success' | 'error'
  pagination?: {
    page: number
    limit: number
    total: number
    total_pages: number
  }
}

export interface ApiError {
  message: string
  code?: string
  status: number
  details?: Record<string, any>
}

// Form validation types
export interface ValidationError {
  field: string
  message: string
  code?: string
}

export interface FormState<T> {
  data: T
  errors: ValidationError[]
  isLoading: boolean
  isValid: boolean
}

// Notification types for UI
export interface UINotification {
  id: string
  title: string
  message: string
  type: 'success' | 'error' | 'warning' | 'info'
  duration?: number
  actions?: Array<{
    label: string
    action: () => void
  }>
}

// =============================================
// SUPABASE DATABASE TYPE
// =============================================

export interface Database {
  public: {
    Tables: {
      users: {
        Row: User
        Insert: Omit<User, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<User, 'id' | 'created_at' | 'updated_at'>>
      }
      applications: {
        Row: Application
        Insert: Omit<Application, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Application, 'id' | 'created_at' | 'updated_at'>>
      }
      permits: {
        Row: Permit
        Insert: Omit<Permit, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Permit, 'id' | 'created_at' | 'updated_at'>>
      }
      water_use_reports: {
        Row: WaterUseReport
        Insert: Omit<WaterUseReport, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<WaterUseReport, 'id' | 'created_at' | 'updated_at'>>
      }
      documents: {
        Row: Document
        Insert: Omit<Document, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Document, 'id' | 'created_at' | 'updated_at'>>
      }
      inspections: {
        Row: Inspection
        Insert: Omit<Inspection, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Inspection, 'id' | 'created_at' | 'updated_at'>>
      }
      reviews: {
        Row: Review
        Insert: Omit<Review, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Review, 'id' | 'created_at' | 'updated_at'>>
      }
      assessments: {
        Row: Assessment
        Insert: Omit<Assessment, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Assessment, 'id' | 'created_at' | 'updated_at'>>
      }
      approvals: {
        Row: Approval
        Insert: Omit<Approval, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Approval, 'id' | 'created_at' | 'updated_at'>>
      }
      workflow_history: {
        Row: WorkflowHistory
        Insert: Omit<WorkflowHistory, 'id' | 'created_at'>
        Update: Partial<Omit<WorkflowHistory, 'id' | 'created_at'>>
      }
      communications: {
        Row: Communication
        Insert: Omit<Communication, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Communication, 'id' | 'created_at' | 'updated_at'>>
      }
      notifications: {
        Row: Notification
        Insert: Omit<Notification, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Notification, 'id' | 'created_at' | 'updated_at'>>
      }
      system_settings: {
        Row: SystemSetting
        Insert: Omit<SystemSetting, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<SystemSetting, 'id' | 'created_at' | 'updated_at'>>
      }
      user_preferences: {
        Row: UserPreferences
        Insert: Omit<UserPreferences, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<UserPreferences, 'id' | 'created_at' | 'updated_at'>>
      }
      audit_logs: {
        Row: AuditLog
        Insert: Omit<AuditLog, 'id' | 'created_at'>
        Update: Partial<Omit<AuditLog, 'id' | 'created_at'>>
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      user_role: UserRole
      user_status: UserStatus
      account_type: AccountType
      id_type: IdType
      application_status: ApplicationStatus
      application_type: ApplicationType
      water_source_type: WaterSourceType
      water_purpose: WaterPurpose
      sla_status: SlaStatus
      permit_status: PermitStatus
      document_type: DocumentType
      verification_status: VerificationStatus
      inspection_status: InspectionStatus
      inspection_type: InspectionType
      inspection_result: InspectionResult
      risk_assessment: RiskAssessment
      recommendation_type: RecommendationType
      province_type: ProvinceType
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// All types are already exported above as individual exports 