-- ⚡ PERFORMANCE: Database Indexes for Water Permit Application
-- Run these in Supabase SQL Editor to improve query performance
-- Date: December 2025

-- ============================================
-- Applications Table Indexes
-- ============================================

-- Index for filtering applications by applicant (used on dashboard)
CREATE INDEX IF NOT EXISTS idx_applications_applicant_id 
ON applications(applicant_id);

-- Index for filtering applications by status (used everywhere)
CREATE INDEX IF NOT EXISTS idx_applications_status 
ON applications(status);

-- Index for looking up applications by number
CREATE INDEX IF NOT EXISTS idx_applications_number 
ON applications(application_number);

-- Composite index for common query: user's applications sorted by date
CREATE INDEX IF NOT EXISTS idx_applications_applicant_created 
ON applications(applicant_id, created_at DESC);

-- Index for filtering by province (common filter)
CREATE INDEX IF NOT EXISTS idx_applications_province 
ON applications(province);

-- Index for assigned staff lookups
CREATE INDEX IF NOT EXISTS idx_applications_assigned_reviewer 
ON applications(assigned_reviewer_id) 
WHERE assigned_reviewer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_applications_assigned_inspector 
ON applications(assigned_inspector_id) 
WHERE assigned_inspector_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_applications_assigned_approver 
ON applications(assigned_approver_id) 
WHERE assigned_approver_id IS NOT NULL;

-- ============================================
-- Documents Table Indexes
-- ============================================

-- Index for fetching documents by application
CREATE INDEX IF NOT EXISTS idx_documents_application_id 
ON documents(application_id);

-- Index for document type filtering
CREATE INDEX IF NOT EXISTS idx_documents_type 
ON documents(type);

-- ============================================
-- Reviews Table Indexes
-- ============================================

-- Index for fetching reviews by application
CREATE INDEX IF NOT EXISTS idx_reviews_application_id 
ON reviews(application_id);

-- Index for reviews by reviewer
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer_id 
ON reviews(reviewer_id);

-- ============================================
-- Inspections Table Indexes
-- ============================================

-- Index for fetching inspections by application
CREATE INDEX IF NOT EXISTS idx_inspections_application_id 
ON inspections(application_id);

-- Index for inspections by inspector
CREATE INDEX IF NOT EXISTS idx_inspections_inspector_id 
ON inspections(inspector_id);

-- Index for inspection status filtering
CREATE INDEX IF NOT EXISTS idx_inspections_status 
ON inspections(status);

-- ============================================
-- Permits Table Indexes
-- ============================================

-- Index for fetching permits by application
CREATE INDEX IF NOT EXISTS idx_permits_application_id 
ON permits(application_id);

-- Index for permit number lookup
CREATE INDEX IF NOT EXISTS idx_permits_number 
ON permits(permit_number);

-- ============================================
-- Users Table Indexes
-- ============================================

-- Index for filtering users by role
CREATE INDEX IF NOT EXISTS idx_users_role 
ON users(role);

-- Index for filtering users by status
CREATE INDEX IF NOT EXISTS idx_users_status 
ON users(status);

-- Index for email lookups
CREATE INDEX IF NOT EXISTS idx_users_email 
ON users(email);

-- ============================================
-- Workflow History Table Indexes
-- ============================================

-- Index for fetching workflow history by application
CREATE INDEX IF NOT EXISTS idx_workflow_history_application_id 
ON workflow_history(application_id);

-- ============================================
-- Analyze Tables (Update Statistics)
-- ============================================
-- Run these to update query planner statistics after creating indexes

ANALYZE applications;
ANALYZE documents;
ANALYZE reviews;
ANALYZE inspections;
ANALYZE permits;
ANALYZE users;
ANALYZE workflow_history;

-- ============================================
-- Verification Query
-- ============================================
-- Run this to verify indexes were created successfully

SELECT 
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN ('applications', 'documents', 'reviews', 'inspections', 'permits', 'users', 'workflow_history')
ORDER BY tablename, indexname;

