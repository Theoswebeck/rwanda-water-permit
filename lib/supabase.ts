import { createClient } from './supabase/client'
import type { Database } from '@/types/database'

// Use the browser client for all operations
export const supabase = createClient()

// DEV ONLY: expose supabase for quick debugging in browser console.
// This helps diagnose RLS/auth issues (e.g., auth.uid() is NULL when session is missing).
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  (window as any).supabase = supabase
}

// Helper function to get the current user
export const getCurrentUser = async () => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) {
      console.error('Error getting current user:', error)
      return null
    }
    return user
  } catch (error) {
    console.error('Error getting current user:', error)
    return null
  }
}

// Helper function to get user profile
export const getUserProfile = async (userId: string) => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()
  
  if (error) throw error
  return data
}

// Helper function to get application by number
export const getApplicationByNumber = async (applicationNumber: string) => {
  const { data, error } = await supabase
    .from('applications')
    .select(`
      *,
      applicant:users!applicant_id(*),
      documents(*),
      reviews:reviews!application_id(*)
    `)
    .eq('application_number', applicationNumber)
    .single()
  
  if (error) throw error
  return data
}

// Helper function to get applications for review
export const getApplicationsForReview = async () => {
  const { data, error } = await supabase
    .from('applications')
    .select(`
      *,
      applicant:users!applicant_id(first_name, last_name, company_name)
    `)
    .in('status', ['submitted', 'under_review', 'pending_inspection', 'revision_required'])
    .order('created_at', { ascending: false })
  
  if (error) throw error
  return data
}

// Helper function to get all applications for inspection view
export const getApplicationsForInspection = async () => {
  try {
    const { data, error } = await supabase
      .from('applications')
      .select(`
        *,
        applicant:users!applicant_id(
          first_name,
          last_name,
          company_name,
          email,
          phone
        )
      `)
      .order('created_at', { ascending: false })
    
    if (error) {
      console.warn('Database error, returning empty array:', error.message)
      return []
    }
    return data || []
  } catch (error) {
    console.warn('Failed to fetch applications for inspection:', error)
    return []
  }
}

// Helper function to add internal review comment
export const addReviewComment = async (applicationId: string, reviewerId: string, comment: string) => {
  const { data, error } = await supabase
    .from('reviews')
    .insert([{
      application_id: applicationId,
      reviewer_id: reviewerId,
      review_stage: 'internal',
      overall_comments: comment,
      status: 'completed'
    }])
    .select()
    .single()
  
  if (error) throw error
  return data
}

// Helper function to update application status
export const updateApplicationStatus = async (applicationId: string, status: string, description?: string) => {
  // Get current status for audit log
  const { data: currentApp } = await supabase
    .from('applications')
    .select('status, application_number')
    .eq('id', applicationId)
    .single()

  const { data, error } = await supabase
    .from('applications')
    .update({ status })
    .eq('id', applicationId)
    .select()
    .single()
  
  if (error) throw error

  // Log the status change
  try {
    await createAuditLog({
      action: 'application.status_changed',
      entity_type: 'application',
      table_name: 'applications',
      record_id: applicationId,
      old_values: { status: currentApp?.status },
      new_values: { status },
      description: description || `Application ${currentApp?.application_number || applicationId} status changed from ${currentApp?.status} to ${status}`,
      severity: 'info',
      status: 'success',
    })
  } catch (auditErr) {
    console.warn('⚠️ Failed to create audit log for status change:', auditErr)
  }

  return data
}

// ============================================
// INSPECTION FUNCTIONS
// ============================================

// Helper function to get applications pending inspection
export const getApplicationsPendingInspection = async () => {
  try {
    const { data, error } = await supabase
      .from('applications')
      .select(`
        *,
        applicant:users!applicant_id(
          first_name,
          last_name,
          company_name,
          email,
          phone
        )
      `)
      .eq('status', 'pending_inspection')
      // Always show latest submissions first (fallback to created_at when submitted_at is null).
      .order('submitted_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
    
    if (error) {
      console.warn('Database error, returning empty array:', error.message)
      return []
    }
    return data || []
  } catch (error) {
    console.warn('Failed to fetch applications pending inspection:', error)
    return []
  }
}

// Helper function to get inspections for a specific inspector
export const getInspectionsByInspector = async (inspectorId: string) => {
  try {
    const { data, error } = await supabase
      .from('inspections')
      .select(`
        *,
        application:applications!application_id(
          *,
          applicant:users!applicant_id(
            first_name,
            last_name,
            company_name,
            email,
            phone
          )
        )
      `)
      .eq('inspector_id', inspectorId)
      .order('scheduled_date', { ascending: false })
    
    if (error) {
      console.warn('Database error, returning empty array:', error.message)
      return []
    }
    return data || []
  } catch (error) {
    console.warn('Failed to fetch inspections by inspector:', error)
    return []
  }
}

// Helper function to get all inspections (for admin view)
export const getAllInspections = async () => {
  try {
    const { data, error } = await supabase
      .from('inspections')
      .select(`
        *,
        application:applications!application_id(
          *,
          applicant:users!applicant_id(
            first_name,
            last_name,
            company_name,
            email,
            phone
          )
        ),
        inspector:users!inspector_id(
          first_name,
          last_name,
          email
        )
      `)
      .order('scheduled_date', { ascending: false })
    
    if (error) {
      console.warn('Database error, returning empty array:', error.message)
      return []
    }
    return data || []
  } catch (error) {
    console.warn('Failed to fetch all inspections:', error)
    return []
  }
}

// Helper function to get inspection by ID
export const getInspectionById = async (inspectionId: string) => {
  const { data, error } = await supabase
    .from('inspections')
    .select(`
      *,
      application:applications!application_id(
        *,
        applicant:users!applicant_id(
          first_name,
          last_name,
          company_name,
          email,
          phone,
          address
        )
      ),
      inspector:users!inspector_id(
        first_name,
        last_name,
        email
      )
    `)
    .eq('id', inspectionId)
    .single()
  
  if (error) throw error
  return data
}

// Helper function to create a new inspection
export const createInspection = async (inspectionData: any) => {
  const { data, error } = await supabase
    .from('inspections')
    .insert([inspectionData])
    .select()
    .single()
  
  if (error) throw error
  return data
}

// Helper function to update inspection
export const updateInspection = async (inspectionId: string, updates: any) => {
  const { data, error } = await supabase
    .from('inspections')
    .update(updates)
    .eq('id', inspectionId)
    .select()
    .single()
  
  if (error) throw error
  return data
}

// Helper function to get inspection statistics
export const getInspectionStats = async () => {
  // Get pending inspections count
  const { count: pendingCount } = await supabase
    .from('applications')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending_inspection')

  // Get completed inspections this month
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  
  const { count: completedThisMonth } = await supabase
    .from('inspections')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'completed')
    .gte('completed_date', startOfMonth.toISOString())

  // Get overdue inspections
  const today = new Date()
  const { count: overdueCount } = await supabase
    .from('inspections')
    .select('*', { count: 'exact', head: true })
    .in('status', ['scheduled', 'in_progress'])
    .lt('scheduled_date', today.toISOString())

  // Get compliance rate
  const { count: totalCompleted } = await supabase
    .from('inspections')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'completed')

  const { count: passedInspections } = await supabase
    .from('inspections')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'completed')
    .eq('result', 'passed')

  const complianceRate = totalCompleted && totalCompleted > 0 && passedInspections ? Math.round((passedInspections / totalCompleted) * 100) : 0

  // Get draft reports count
  const { count: draftCount } = await supabase
    .from('inspections')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'in_progress')

  return {
    pendingCount: pendingCount || 0,
    completedThisMonth: completedThisMonth || 0,
    overdueCount: overdueCount || 0,
    complianceRate,
    draftCount: draftCount || 0
  }
}

// Helper function to assign inspector to application
export const assignInspectorToApplication = async (applicationId: string, inspectorId: string) => {
  // Get current application and inspector info for audit log
  const { data: currentApp } = await supabase
    .from('applications')
    .select('status, application_number, assigned_inspector_id')
    .eq('id', applicationId)
    .single()

  const { data: inspector } = await supabase
    .from('users')
    .select('first_name, last_name, email')
    .eq('id', inspectorId)
    .single()

  const { data, error } = await supabase
    .from('applications')
    .update({ 
      assigned_inspector_id: inspectorId,
      status: 'pending_inspection'
    })
    .eq('id', applicationId)
    .select()
    .single()
  
  if (error) throw error

  // Log the assignment
  const inspectorName = inspector ? `${inspector.first_name} ${inspector.last_name}` : inspectorId
  try {
    await createAuditLog({
      action: 'application.assigned',
      entity_type: 'application',
      table_name: 'applications',
      record_id: applicationId,
      old_values: { assigned_inspector_id: currentApp?.assigned_inspector_id, status: currentApp?.status },
      new_values: { assigned_inspector_id: inspectorId, status: 'pending_inspection' },
      description: `Application ${currentApp?.application_number || applicationId} assigned to inspector ${inspectorName}`,
      severity: 'info',
      status: 'success',
    })
  } catch (auditErr) {
    console.warn('⚠️ Failed to create audit log for inspector assignment:', auditErr)
  }

  return data
}

// Helper function to schedule inspection
export const scheduleInspection = async (applicationId: string, inspectorId: string, scheduledDate: string) => {
  // Generate inspection number
  const inspectionNumber = `INS-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`
  
  const inspectionData = {
    application_id: applicationId,
    inspector_id: inspectorId,
    inspection_number: inspectionNumber,
    type: 'initial' as const,
    status: 'scheduled' as const,
    scheduled_date: scheduledDate
  }
  
  const { data, error } = await supabase
    .from('inspections')
    .insert([inspectionData])
    .select()
    .single()
  
  if (error) throw error
  return data
}

// Helper function to complete inspection and update application status
export const completeInspection = async (
  inspectionId: string, 
  inspectionData: {
    result: 'passed' | 'failed' | 'conditional',
    overall_score?: number,
    recommendations?: string,
    follow_up_required?: boolean,
    location_verified?: boolean,
    technical_compliance?: boolean,
    environmental_compliance?: boolean,
    regulatory_compliance?: boolean,
    [key: string]: any
  }
) => {
  try {
    // Update inspection with completion data
    const { data: inspection, error: inspectionError } = await supabase
      .from('inspections')
      .update({
        ...inspectionData,
        status: 'completed',
        completed_date: new Date().toISOString()
      })
      .eq('id', inspectionId)
      .select('application_id')
      .single()
    
    if (inspectionError) throw inspectionError
    
    // Update application status to pending_final_approval
    const { error: applicationError } = await supabase
      .from('applications')
      .update({ 
        status: 'pending_final_approval',
        inspected_at: new Date().toISOString()
      })
      .eq('id', inspection.application_id)
    
    if (applicationError) throw applicationError
    
    return inspection
  } catch (error) {
    console.error('Error completing inspection:', error)
    throw error
  }
} 

// Helper function to get application by ID (for inspector view)
export const getApplicationById = async (applicationId: string) => {
  try {
    const { data, error } = await supabase
      .from('applications')
      .select(`
        *,
        applicant:users!applicant_id(
          first_name,
          last_name,
          company_name,
          email,
          phone
        )
      `)
      .eq('id', applicationId)
      .single()
    
    if (error) {
      console.warn('Database error, returning null:', error.message)
      return null
    }
    return data
  } catch (error) {
    console.warn('Failed to fetch application by ID:', error)
    return null
  }
}

// ============================================
// ADMIN DASHBOARD FUNCTIONS
// ============================================

// Helper function to get all users for admin management
export const getAllUsers = async () => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select(`
        *,
        applications_count,
        reviews_count,
        inspections_count
      `)
      .order('created_at', { ascending: false })
    
    if (error) {
      console.warn('Database error, returning empty array:', error.message)
      return []
    }
    return data || []
  } catch (error) {
    console.warn('Failed to fetch users:', error)
    return []
  }
}

// Helper function to get admin dashboard statistics
export const getAdminDashboardStats = async () => {
  try {
    // Get total users count
    const { count: totalUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })

    // Get total applications count
    const { count: totalApplications } = await supabase
      .from('applications')
      .select('*', { count: 'exact', head: true })

    // Get pending reviews count
    const { count: pendingReviews } = await supabase
      .from('applications')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'under_review')

    // Get pending assessments count
    const { count: pendingAssessments } = await supabase
      .from('applications')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending_assessment')

    // Get pending approvals count
    const { count: pendingApprovals } = await supabase
      .from('applications')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending_final_approval')

    // Get active inspections count
    const { count: activeInspections } = await supabase
      .from('inspections')
      .select('*', { count: 'exact', head: true })
      .in('status', ['scheduled', 'in_progress'])

    return {
      totalUsers: totalUsers || 0,
      totalApplications: totalApplications || 0,
      pendingReviews: pendingReviews || 0,
      pendingAssessments: pendingAssessments || 0,
      pendingApprovals: pendingApprovals || 0,
      activeInspections: activeInspections || 0
    }
  } catch (error) {
    console.warn('Failed to fetch admin dashboard stats:', error)
    return {
      totalUsers: 0,
      totalApplications: 0,
      pendingReviews: 0,
      pendingAssessments: 0,
      pendingApprovals: 0,
      activeInspections: 0
    }
  }
}

// Helper function to create a new user
export const createUser = async (userData: any) => {
  const { data, error } = await supabase
    .from('users')
    .insert([userData])
    .select()
    .single()
  
  if (error) throw error
  return data
}

// Helper function to update user
export const updateUser = async (userId: string, updates: any) => {
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId)
    .select()
    .single()
  
  if (error) throw error
  return data
}

// Helper function to delete user with proper foreign key handling
export const deleteUser = async (userId: string) => {
  try {
    // Start a transaction by using multiple operations
    // First, handle references that should be set to NULL (preserve audit trail)
    
    // Set user_id to NULL in workflow_history (preserve audit records)
    const { error: workflowError } = await supabase
      .from('workflow_history')
      .update({ user_id: null })
      .eq('user_id', userId);
    
    if (workflowError) throw workflowError;

    // Set assigned staff to NULL in applications (unassign user)
    const { error: appsError } = await supabase
      .from('applications')
      .update({ 
        assigned_reviewer_id: null,
        assigned_inspector_id: null,
        assigned_approver_id: null 
      })
      .or(`assigned_reviewer_id.eq.${userId},assigned_inspector_id.eq.${userId},assigned_approver_id.eq.${userId}`);
    
    if (appsError) throw appsError;

    // Set verified_by to NULL in documents
    const { error: docsError } = await supabase
      .from('documents')
      .update({ verified_by: null })
      .eq('verified_by', userId);
    
    if (docsError) throw docsError;

    // Set delegated_from to NULL in approvals
    const { error: approvalsError } = await supabase
      .from('approvals')
      .update({ delegated_from: null })
      .eq('delegated_from', userId);
    
    if (approvalsError) throw approvalsError;

    // Set sender_id and recipient_id to NULL in communications
    const { error: commSenderError } = await supabase
      .from('communications')
      .update({ sender_id: null })
      .eq('sender_id', userId);
    
    if (commSenderError) throw commSenderError;

    const { error: commRecipientError } = await supabase
      .from('communications')
      .update({ recipient_id: null })
      .eq('recipient_id', userId);
    
    if (commRecipientError) throw commRecipientError;

    // Finally, delete the user (applications, reviews, inspections, etc. will cascade)
    const { error: deleteError } = await supabase
      .from('users')
      .delete()
      .eq('id', userId);
    
    if (deleteError) throw deleteError;
    
    return true;
  } catch (error) {
    console.error('Error deleting user:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to delete user: ${errorMessage}`);
  }
}

// ============================================
// APPROVER DASHBOARD FUNCTIONS
// ============================================

// Helper function to get applications pending final approval
export const getApplicationsPendingApproval = async () => {
  try {
    console.log('🔍 [getApplicationsPendingApproval] Starting query for pending_final_approval applications...');
    
    // Get applications that are in pending_final_approval status
    const { data: applications, error } = await supabase
      .from('applications')
      .select('*')
      .eq('status', 'pending_final_approval')
      .order('created_at', { ascending: false })
    
    console.log('📊 [getApplicationsPendingApproval] Query result:', { data: applications?.length, error: error?.message });
    
    if (error) {
      console.warn('❌ [getApplicationsPendingApproval] Database error:', error.message)
      return []
    }

    if (!applications || applications.length === 0) {
      console.log('✅ [getApplicationsPendingApproval] No applications found');
      return []
    }

    // Fetch user data separately for each application to avoid relationship issues
    const enrichedApplications = await Promise.all(
      applications.map(async (app: any) => {
        try {
          // Fetch applicant data
          const { data: applicant } = await supabase
            .from('users')
            .select('first_name, last_name, company_name, email, phone, account_type')
            .eq('id', app.applicant_id)
            .single();

          // Fetch reviewer data if assigned
          let assigned_reviewer = null;
          if (app.assigned_reviewer_id) {
            const { data: reviewer } = await supabase
              .from('users')
              .select('first_name, last_name')
              .eq('id', app.assigned_reviewer_id)
              .single();
            assigned_reviewer = reviewer;
          }

          // Fetch inspector data if assigned  
          let assigned_inspector = null;
          if (app.assigned_inspector_id) {
            const { data: inspector } = await supabase
              .from('users')
              .select('first_name, last_name')
              .eq('id', app.assigned_inspector_id)
              .single();
            assigned_inspector = inspector;
          }

          return {
            ...app,
            applicant,
            assigned_reviewer,
            assigned_inspector
          };
        } catch (err) {
          console.warn(`Error enriching application ${app.id}:`, err);
          return app; // Return basic app data if enrichment fails
        }
      })
    );

    console.log('✅ [getApplicationsPendingApproval] Returning', enrichedApplications.length, 'enriched applications');
    return enrichedApplications
  } catch (error) {
    console.warn('❌ [getApplicationsPendingApproval] Exception:', error)
    return []
  }
}

// Helper function to get approver dashboard statistics
export const getApproverDashboardStats = async () => {
  try {
    // Panel 1: Pending Final Approval (my queue - needs decision)
    const { count: pendingFinalApproval } = await supabase
      .from('applications')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending_final_approval')

    // Panel 2: Returned to Verification (items I sent back - under work/follow-ups)
    const { count: returnedToVerification } = await supabase
      .from('applications')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'returned_to_verification')

    // Panel 3: Approved Pending Permit (next stage - awaiting applicant terms acceptance)
    const { count: approvedPendingPermit } = await supabase
      .from('applications')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'approved_pending_permit')

    // Panel 4: Approved/Permits Issued (next-next stage - active permits)
    const { count: approved } = await supabase
      .from('applications')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'approved')

    // Get total applications count for overview
    const { count: totalApplications } = await supabase
      .from('applications')
      .select('*', { count: 'exact', head: true })

    return {
      pendingFinalApproval: pendingFinalApproval || 0,
      returnedToVerification: returnedToVerification || 0,
      approvedPendingPermit: approvedPendingPermit || 0,
      approved: approved || 0,
      totalApplications: totalApplications || 0,
      avgDecisionTime: 2.3,
      complianceRate: 98.2
    }
  } catch (error) {
    console.warn('Failed to fetch approver dashboard stats:', error)
    return {
      pendingFinalApproval: 0,
      returnedToVerification: 0,
      approvedPendingPermit: 0,
      approved: 0,
      totalApplications: 0,
      avgDecisionTime: 2.3,
      complianceRate: 98.2
    }
  }
}

// Helper function to approve application
export const approveApplication = async (applicationId: string, approverId: string, conditions?: any) => {
  const { data, error } = await supabase
    .from('applications')
    .update({ 
      status: 'approved_pending_permit',
      assigned_approver_id: approverId,
      approved_at: new Date().toISOString(),
      terms_presented_at: new Date().toISOString(),
      terms_status: 'pending'
    })
    .eq('id', applicationId)
    .select()
    .single()
  
  if (error) throw error

  // Also create approval record
  const { data: approval, error: approvalError } = await supabase
    .from('approvals')
    .insert([{
      application_id: applicationId,
      approver_id: approverId,
      decision: 'approved',
      conditions: conditions,
      approved_at: new Date().toISOString()
    }])
    .select()
    .single()

  if (approvalError) throw approvalError
  
  return { application: data, approval }
}

// Helper function to reject application
export const rejectApplication = async (applicationId: string, approverId: string, rejectionReason: string) => {
  const { data, error } = await supabase
    .from('applications')
    .update({ 
      status: 'rejected',
      assigned_approver_id: approverId,
      rejection_reason: rejectionReason,
      rejected_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', applicationId)
    .select()
    .single()
  
  if (error) throw error
  return data
}

// ============================================
// ADDITIONAL ADMIN FUNCTIONS FOR COMPONENTS
// ============================================

// Get all applications for admin oversight
export const getAllApplicationsForAdmin = async () => {
  try {
    const { data, error } = await supabase
      .from('applications')
      .select(`
        *,
        applicant:users!applicant_id(
          first_name,
          last_name,
          company_name,
          account_type
        ),
        assigned_reviewer:users!assigned_reviewer_id(
          first_name,
          last_name
        ),
        assigned_inspector:users!assigned_inspector_id(
          first_name,
          last_name
        )
      `)
      .order('created_at', { ascending: false })
    
    if (error) {
      console.warn('Database error, returning empty array:', error.message)
      return []
    }
    return data || []
  } catch (error) {
    console.warn('Failed to fetch all applications for admin:', error)
    return []
  }
}

// Get application status distribution for system overview
export const getApplicationStatusDistribution = async () => {
  try {
    const { data, error } = await supabase
      .from('applications')
      .select('status')
    
    if (error) {
      console.warn('Database error, returning empty array:', error.message)
      return []
    }
    
    // Count applications by status
    const statusCounts: Record<string, number> = {}
    data?.forEach(app => {
      statusCounts[app.status] = (statusCounts[app.status] || 0) + 1
    })
    
    const total = data?.length || 0
    
    return [
      { status: "Submitted", count: statusCounts['submitted'] || 0, color: "bg-blue-500" },
      { status: "Under Review", count: statusCounts['under_review'] || 0, color: "bg-yellow-500" },
      { status: "Pending Inspection", count: statusCounts['pending_inspection'] || 0, color: "bg-orange-500" },
      { status: "Approved", count: statusCounts['approved'] || 0, color: "bg-green-500" },
      { status: "Rejected", count: statusCounts['rejected'] || 0, color: "bg-red-500" }
    ]
  } catch (error) {
    console.warn('Failed to fetch application status distribution:', error)
    return []
  }
}

// Get recent system activity
export const getRecentSystemActivity = async () => {
  try {
    interface Activity {
      id: string;
      action: string;
      details: string;
      timestamp: string;
      type: string;
    }
    
    // Get recent applications
    const { data: recentApps, error: appsError } = await supabase
      .from('applications')
      .select(`
        id,
        status,
        created_at,
        updated_at,
        application_number,
        applicant:users!applicant_id(first_name, last_name, company_name)
      `)
      .order('created_at', { ascending: false })
      .limit(10)
    
    // Get recent users
    const { data: recentUsers, error: usersError } = await supabase
      .from('users')
      .select('id, first_name, last_name, company_name, created_at, role')
      .order('created_at', { ascending: false })
      .limit(5)
    
    // Get recent inspections
    const { data: recentInspections, error: inspError } = await supabase
      .from('inspections')
      .select(`
        id,
        status,
        completed_at,
        application:applications!application_id(application_number, project_title)
      `)
      .order('created_at', { ascending: false })
      .limit(5)
    
    const activities: Activity[] = []
    
    // Add application activities
    if (recentApps) {
      recentApps.forEach(app => {
        const applicant = Array.isArray(app.applicant) ? app.applicant[0] : app.applicant
        const applicantName = applicant?.company_name || 
                            `${applicant?.first_name || ''} ${applicant?.last_name || ''}`.trim() || 
                            'Unknown'
        
        activities.push({
          id: `app-${app.id}`,
          action: app.status === 'submitted' ? 'New application submitted' : `Application ${app.status.replace('_', ' ')}`,
          details: `${app.application_number || app.id} by ${applicantName}`,
          timestamp: getTimeAgo(app.created_at),
          type: 'application'
        })
      })
    }
    
    // Add user activities
    if (recentUsers) {
      recentUsers.forEach(user => {
        const userName = user.company_name || 
                        `${user.first_name || ''} ${user.last_name || ''}`.trim() || 
                        'Unknown'
        
        activities.push({
          id: `user-${user.id}`,
          action: 'New user registered',
          details: `${userName} (${user.role})`,
          timestamp: getTimeAgo(user.created_at),
          type: 'user'
        })
      })
    }
    
    // Add inspection activities
    if (recentInspections) {
      recentInspections.forEach(inspection => {
        if (inspection.completed_at) {
          const application = Array.isArray(inspection.application) ? inspection.application[0] : inspection.application
          activities.push({
            id: `inspection-${inspection.id}`,
            action: 'Inspection completed',
            details: `${application?.application_number || 'Unknown'} - ${application?.project_title || 'Unknown project'}`,
            timestamp: getTimeAgo(inspection.completed_at),
            type: 'inspection'
          })
        }
      })
    }
    
    // Sort by timestamp and return top 5
    return activities
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5)
      
  } catch (error) {
    console.warn('Failed to fetch recent system activity:', error)
    return []
  }
}

// Helper function to get time ago string
const getTimeAgo = (dateString: string) => {
  const now = new Date()
  const date = new Date(dateString)
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))
  
  if (diffInMinutes < 1) return 'Just now'
  if (diffInMinutes < 60) return `${diffInMinutes} minute${diffInMinutes === 1 ? '' : 's'} ago`
  
  const diffInHours = Math.floor(diffInMinutes / 60)
  if (diffInHours < 24) return `${diffInHours} hour${diffInHours === 1 ? '' : 's'} ago`
  
  const diffInDays = Math.floor(diffInHours / 24)
  return `${diffInDays} day${diffInDays === 1 ? '' : 's'} ago`
}

// Get comprehensive admin reports data
export const getAdminReportsData = async () => {
  try {
    // Get all applications for analysis with related data
    const { data: applications, error: appsError } = await supabase
      .from('applications')
      .select(`
        *,
        applicant:users!applicant_id(first_name, last_name, company_name),
        reviews(created_at, completed_at, recommendation),
        inspections(created_at, completed_date, result),
        permits(issued_date)
      `)
    
    if (appsError) {
      console.warn('Database error:', appsError.message)
      // Return basic data structure with empty values instead of null
      return {
        overview: {
          totalApplications: 0,
          approvedApplications: 0,
          rejectedApplications: 0,
          pendingApplications: 0,
          totalValue: 0,
          avgProcessingTime: 0,
          userSatisfaction: 0,
          systemUptime: 0 // Return 0 instead of mock value
        },
        byType: {},
        byLocation: {},
        performance: {
          avgReviewTime: 0,
          avgInspectionTime: 0,
          overtimeApplications: 0,
          staffUtilization: 0,
          errorRate: 0
        }
      }
    }



    // Handle case where applications might be null
    if (!applications || !Array.isArray(applications)) {
      console.warn('No applications data received')
      return {
        overview: {
          totalApplications: 0,
          approvedApplications: 0,
          rejectedApplications: 0,
          pendingApplications: 0,
          totalValue: 0,
          avgProcessingTime: 0,
          userSatisfaction: 0,
          systemUptime: 0 // Return 0 instead of mock value
        },
        byType: {},
        byLocation: {},
        performance: {
          avgReviewTime: 0,
          avgInspectionTime: 0,
          overtimeApplications: 0,
          staffUtilization: 0,
          errorRate: 0
        }
      }
    }

    const totalApplications = applications.length
    const approvedApplications = applications.filter(app => app.status === 'approved').length
    const rejectedApplications = applications.filter(app => app.status === 'rejected').length
    const pendingApplications = applications.filter(app => 
      ['submitted', 'under_review', 'pending_inspection', 'pending_final_approval'].includes(app.status)
    ).length
    
    // Calculate total value from all applications
    const totalValue = applications.reduce((sum, app) => sum + (app.project_value || 0), 0)
    
    // Calculate real processing times
    const completedApps = applications.filter(app => 
      app.status === 'approved' || app.status === 'rejected'
    )
    
    const avgProcessingTime = completedApps.length > 0 
      ? completedApps.reduce((sum, app) => {
          const created = new Date(app.created_at)
          const completed = new Date(app.updated_at)
          const days = Math.ceil((completed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
          return sum + days
        }, 0) / completedApps.length
      : 0

    // Calculate average review time from reviews
    const reviewedApps = applications.filter(app => app.reviews && app.reviews.length > 0 && app.reviews[0]?.completed_at)
    const avgReviewTime = reviewedApps.length > 0
      ? reviewedApps.reduce((sum, app) => {
          if (app.reviews && app.reviews[0] && app.reviews[0].completed_at) {
            const created = new Date(app.created_at)
            const reviewed = new Date(app.reviews[0].completed_at)
            const days = Math.ceil((reviewed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
            return sum + Math.max(0, days)
          }
          return sum
        }, 0) / reviewedApps.length
      : 0

    // Calculate average inspection time
    const inspectedApps = applications.filter(app => app.inspections && app.inspections.length > 0 && app.inspections[0]?.completed_date)
    const avgInspectionTime = inspectedApps.length > 0
      ? inspectedApps.reduce((sum, app) => {
          if (app.inspections && app.inspections[0] && app.inspections[0].completed_date && app.reviews && app.reviews[0]?.completed_at) {
            const reviewed = new Date(app.reviews[0].completed_at)
            const inspected = new Date(app.inspections[0].completed_date)
            const days = Math.ceil((inspected.getTime() - reviewed.getTime()) / (1000 * 60 * 60 * 24))
            return sum + Math.max(0, days)
          }
          return sum
        }, 0) / inspectedApps.length
      : 0

    // Group by application type with real data
    const byType: Record<string, any> = {}
    applications.forEach(app => {
      const type = app.application_type || 'unknown'
      if (!byType[type]) {
        byType[type] = { count: 0, value: 0 }
      }
      byType[type].count++
      byType[type].value += app.project_value || 0
    })
    
    // Calculate percentages for byType
    Object.keys(byType).forEach(type => {
      byType[type].percentage = totalApplications > 0 ? (byType[type].count / totalApplications) * 100 : 0
    })
    
    // Group by location (province) with real data
    const byLocation: Record<string, any> = {}
    applications.forEach(app => {
      const province = app.province?.toLowerCase() || 'unknown'
      if (!byLocation[province]) {
        byLocation[province] = { count: 0 }
      }
      byLocation[province].count++
    })
    
    // Calculate percentages for byLocation
    Object.keys(byLocation).forEach(province => {
      byLocation[province].percentage = totalApplications > 0 
        ? parseFloat(((byLocation[province].count / totalApplications) * 100).toFixed(1))
        : 0
    })

    // Calculate user satisfaction based on approval rate and processing efficiency
    const approvalRate = totalApplications > 0 ? (approvedApplications / totalApplications) : 0
    const efficiencyScore = avgProcessingTime > 0 ? Math.max(1, 5 - (avgProcessingTime / 5)) : 4.2
    const userSatisfaction = (approvalRate * 2 + efficiencyScore * 3) / 5 // Weighted score

    // Calculate overdue applications
    const now = new Date()
    const overtimeApplications = applications.filter(app => {
      if (!app.due_date || app.status === 'approved' || app.status === 'rejected') return false
      return new Date(app.due_date) < now
    }).length

    // Calculate system uptime from actual system logs/events if available
    // For now, return a default value since we don't have uptime tracking
    // TODO: Implement actual uptime tracking from system events/logs
    const systemUptime = 99.5 // Default value until uptime tracking is implemented

    // Calculate staff utilization based on active assignments
    let staffUtilization = 0
    try {
      const { data: activeAssignments } = await supabase
        .from('applications')
        .select('assigned_reviewer, assigned_inspector')
        .in('status', ['under_review', 'pending_inspection', 'pending_final_approval'])

      const { data: totalStaff } = await supabase
        .from('users')
        .select('id')
        .in('role', ['reviewer', 'inspector', 'approver'])

      if (activeAssignments && totalStaff && totalStaff.length > 0) {
        const uniqueAssignedStaff = new Set()
        activeAssignments.forEach(app => {
          if (app.assigned_reviewer) uniqueAssignedStaff.add(app.assigned_reviewer)
          if (app.assigned_inspector) uniqueAssignedStaff.add(app.assigned_inspector)
        })
        staffUtilization = (uniqueAssignedStaff.size / totalStaff.length) * 100
      }
    } catch (staffError) {
      console.warn('Error calculating staff utilization:', staffError)
      staffUtilization = 0
    }

    // Calculate error rate (applications returned for revision)
    const revisionsRequired = applications.filter(app => app.status === 'revision_required').length
    const errorRate = totalApplications > 0 ? (revisionsRequired / totalApplications) * 100 : 0
    
    return {
      overview: {
        totalApplications,
        approvedApplications,
        rejectedApplications,
        pendingApplications,
        totalValue,
        avgProcessingTime: Math.round(avgProcessingTime * 10) / 10,
        userSatisfaction: Math.round(userSatisfaction * 10) / 10,
        systemUptime: Math.round(systemUptime * 10) / 10
      },
      byType,
      byLocation,
      performance: {
        avgReviewTime: Math.round(avgReviewTime * 10) / 10,
        avgInspectionTime: Math.round(avgInspectionTime * 10) / 10,
        overtimeApplications,
        staffUtilization: Math.round(staffUtilization),
        errorRate: Math.round(errorRate * 100) / 100
      }
    }
  } catch (error) {
    console.warn('Failed to fetch admin reports data:', error)
    return null
  }
}

// Get monthly application statistics
export const getMonthlyApplicationStats = async () => {
  try {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)

    // Get applications this month
    const { count: thisMonthCount } = await supabase
      .from('applications')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfMonth.toISOString())

    // Get applications last month
    const { count: lastMonthCount } = await supabase
      .from('applications')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfLastMonth.toISOString())
      .lt('created_at', startOfMonth.toISOString())

    // Calculate percentage change
    const change = lastMonthCount && lastMonthCount > 0
      ? ((thisMonthCount || 0) - lastMonthCount) / lastMonthCount * 100
      : 0

    return {
      thisMonth: thisMonthCount || 0,
      lastMonth: lastMonthCount || 0,
      change: Math.round(change * 10) / 10
    }
  } catch (error) {
    console.warn('Failed to fetch monthly application stats:', error)
    return { thisMonth: 0, lastMonth: 0, change: 0 }
  }
}

// Get monthly user statistics
export const getMonthlyUserStats = async () => {
  try {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)

    // Get total users
    const { count: totalUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })

    // Get active users (users who have logged in within last 30 days)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const { data: recentLogins } = await supabase
      .from('users')
      .select('id, last_login')
      .not('last_login', 'is', null)
      .gte('last_login', thirtyDaysAgo.toISOString())

    // Get new users this month
    const { count: newThisMonth } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfMonth.toISOString())

    // Get new users last month
    const { count: newLastMonth } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfLastMonth.toISOString())
      .lt('created_at', startOfMonth.toISOString())

    // Calculate percentage change
    const change = newLastMonth && newLastMonth > 0
      ? ((newThisMonth || 0) - newLastMonth) / newLastMonth * 100
      : 0

    return {
      total: totalUsers || 0,
      active: recentLogins?.length || 0,
      newThisMonth: newThisMonth || 0,
      change: Math.round(change * 10) / 10
    }
  } catch (error) {
    console.warn('Failed to fetch monthly user stats:', error)
    return { total: 0, active: 0, newThisMonth: 0, change: 0 }
  }
}

// Get processing time statistics with improvement calculation
export const getProcessingTimeStats = async () => {
  try {
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)

    // Get completed applications in last 30 days
    const { data: recentCompleted } = await supabase
      .from('applications')
      .select('created_at, updated_at, status')
      .in('status', ['approved', 'rejected'])
      .gte('updated_at', thirtyDaysAgo.toISOString())

    // Get completed applications from 30-60 days ago
    const { data: previousCompleted } = await supabase
      .from('applications')
      .select('created_at, updated_at, status')
      .in('status', ['approved', 'rejected'])
      .gte('updated_at', sixtyDaysAgo.toISOString())
      .lt('updated_at', thirtyDaysAgo.toISOString())

    // Calculate average processing time for recent period
    let avgRecent = 0
    if (recentCompleted && recentCompleted.length > 0) {
      const totalDays = recentCompleted.reduce((sum, app) => {
        const created = new Date(app.created_at)
        const updated = new Date(app.updated_at)
        const days = Math.ceil((updated.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
        return sum + Math.max(0, days)
      }, 0)
      avgRecent = totalDays / recentCompleted.length
    }

    // Calculate average processing time for previous period
    let avgPrevious = 0
    if (previousCompleted && previousCompleted.length > 0) {
      const totalDays = previousCompleted.reduce((sum, app) => {
        const created = new Date(app.created_at)
        const updated = new Date(app.updated_at)
        const days = Math.ceil((updated.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
        return sum + Math.max(0, days)
      }, 0)
      avgPrevious = totalDays / previousCompleted.length
    }

    // Calculate improvement
    const improvement = avgPrevious > 0 ? avgPrevious - avgRecent : 0

    return {
      avgProcessingTime: Math.round(avgRecent * 10) / 10,
      improvement: Math.round(improvement * 10) / 10
    }
  } catch (error) {
    console.warn('Failed to fetch processing time stats:', error)
    return { avgProcessingTime: 0, improvement: 0 }
  }
}

// Get real team workload based on actual application assignments
export const getTeamWorkload = async () => {
  try {
    // Get users by role with error checking
    const { data: reviewers } = await supabase
      .from('users')
      .select('id, first_name, last_name')
      .eq('role', 'reviewer')

    const { data: inspectors } = await supabase
      .from('users')
      .select('id, first_name, last_name')
      .eq('role', 'inspector')

    const { data: approvers } = await supabase
      .from('users')
      .select('id, first_name, last_name')
      .eq('role', 'approver')

    // Get applications under review (assigned to reviewers)
    const { data: reviewApplications } = await supabase
      .from('applications')
      .select('id')
      .eq('status', 'under_review')

    // Get applications pending inspection (assigned to inspectors)
    const { data: inspectionApplications } = await supabase
      .from('applications')
      .select('id')
      .eq('status', 'pending_inspection')

    // Get applications ready for approval (simplified approach)
    const { data: pendingApprovalApplications } = await supabase
      .from('applications')
      .select('id')
      .in('status', ['pending_inspection'])

    // Get overdue applications
    const { data: overdueApplications } = await supabase
      .from('applications')
      .select('id')
      .eq('sla_status', 'overdue')

    // Calculate workload for reviewers
    const reviewerCount = reviewers?.length || 0
    const totalReviewApplications = reviewApplications?.length || 0
    const avgReviewerWorkload = reviewerCount > 0 ? totalReviewApplications / reviewerCount : 0

    // Calculate workload for inspectors
    const inspectorCount = inspectors?.length || 0
    const totalInspectionApplications = inspectionApplications?.length || 0
    const avgInspectorWorkload = inspectorCount > 0 ? totalInspectionApplications / inspectorCount : 0

    // Calculate workload for approvers
    const approverCount = approvers?.length || 0
    const totalApprovalApplications = pendingApprovalApplications?.length || 0
    const avgApproverWorkload = approverCount > 0 ? totalApprovalApplications / approverCount : 0

    return {
      reviewers: {
        count: reviewerCount,
        totalApplications: totalReviewApplications,
        avgWorkload: Math.round(avgReviewerWorkload * 10) / 10, // Round to 1 decimal
        workloadPercentage: Math.min(100, (avgReviewerWorkload / 15) * 100) // Assume 15 is max capacity
      },
      inspectors: {
        count: inspectorCount,
        totalApplications: totalInspectionApplications,
        avgWorkload: Math.round(avgInspectorWorkload * 10) / 10,
        workloadPercentage: Math.min(100, (avgInspectorWorkload / 10) * 100) // Assume 10 is max capacity
      },
      approvers: {
        count: approverCount,
        totalApplications: totalApprovalApplications,
        avgWorkload: Math.round(avgApproverWorkload * 10) / 10,
        workloadPercentage: Math.min(100, (avgApproverWorkload / 8) * 100) // Assume 8 is max capacity
      },
      overdueApplications: overdueApplications?.length || 0
    }
  } catch (error) {
    console.warn('Failed to fetch team workload:', error)
    return {
      reviewers: { count: 0, totalApplications: 0, avgWorkload: 0, workloadPercentage: 0 },
      inspectors: { count: 0, totalApplications: 0, avgWorkload: 0, workloadPercentage: 0 },
      approvers: { count: 0, totalApplications: 0, avgWorkload: 0, workloadPercentage: 0 },
      overdueApplications: 0
    }
  }
}

// ============================================
// APPLICATION DELETION FUNCTIONS
// ============================================

// Helper function to delete application and all related data
export const deleteApplicationCompletely = async (applicationNumber: string) => {
  try {
    console.log(`🗑️ Starting deletion of application: ${applicationNumber}`);
    
    // First, get the application to find its ID
    const { data: application, error: fetchError } = await supabase
      .from('applications')
      .select('id')
      .eq('application_number', applicationNumber)
      .single();
    
    if (fetchError) {
      throw new Error(`Failed to find application: ${fetchError.message}`);
    }
    
    if (!application) {
      throw new Error(`Application ${applicationNumber} not found`);
    }
    
    const applicationId = application.id;
    console.log(`📋 Found application ID: ${applicationId}`);
    
    // Delete related data in the correct order to avoid foreign key violations
    
    // 1. Delete workflow history
    const { error: workflowError } = await supabase
      .from('workflow_history')
      .delete()
      .eq('application_id', applicationId);
    
    if (workflowError) {
      console.warn('Warning deleting workflow history:', workflowError.message);
    } else {
      console.log('✅ Deleted workflow history');
    }
    
    // 2. Delete communications
    const { error: communicationsError } = await supabase
      .from('communications')
      .delete()
      .eq('application_id', applicationId);
    
    if (communicationsError) {
      console.warn('Warning deleting communications:', communicationsError.message);
    } else {
      console.log('✅ Deleted communications');
    }
    
    // 3. Delete approvals
    const { error: approvalsError } = await supabase
      .from('approvals')
      .delete()
      .eq('application_id', applicationId);
    
    if (approvalsError) {
      console.warn('Warning deleting approvals:', approvalsError.message);
    } else {
      console.log('✅ Deleted approvals');
    }
    
    // 4. Delete inspections
    const { error: inspectionsError } = await supabase
      .from('inspections')
      .delete()
      .eq('application_id', applicationId);
    
    if (inspectionsError) {
      console.warn('Warning deleting inspections:', inspectionsError.message);
    } else {
      console.log('✅ Deleted inspections');
    }
    
    // 5. Delete reviews
    const { error: reviewsError } = await supabase
      .from('reviews')
      .delete()
      .eq('application_id', applicationId);
    
    if (reviewsError) {
      console.warn('Warning deleting reviews:', reviewsError.message);
    } else {
      console.log('✅ Deleted reviews');
    }
    
    // 6. Delete documents
    const { error: documentsError } = await supabase
      .from('documents')
      .delete()
      .eq('application_id', applicationId);
    
    if (documentsError) {
      console.warn('Warning deleting documents:', documentsError.message);
    } else {
      console.log('✅ Deleted documents');
    }
    
    // 7. Delete permits
    const { error: permitsError } = await supabase
      .from('permits')
      .delete()
      .eq('application_id', applicationId);
    
    if (permitsError) {
      console.warn('Warning deleting permits:', permitsError.message);
    } else {
      console.log('✅ Deleted permits');
    }
    
    // 8. Finally, delete the application itself
    const { error: applicationError } = await supabase
      .from('applications')
      .delete()
      .eq('id', applicationId);
    
    if (applicationError) {
      throw new Error(`Failed to delete application: ${applicationError.message}`);
    }
    
    console.log('✅ Successfully deleted application and all related data');
    return { success: true, message: `Application ${applicationNumber} has been completely deleted` };
    
  } catch (error) {
    console.error('❌ Error deleting application:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, message: `Failed to delete application: ${errorMessage}` };
  }
}

// ============================================
// AUDIT LOGS FUNCTIONS
// ============================================

export type AuditSeverity = 'info' | 'warning' | 'critical'
export type AuditStatus = 'success' | 'failed'
export type AuditEntityType = 'user' | 'application' | 'permit' | 'inspection' | 'review' | 'assessment' | 'document' | 'payment' | 'system'

export interface AuditLogEntry {
  id: string
  user_id: string | null
  action: string
  table_name: string | null
  record_id: string | null
  old_values: any | null
  new_values: any | null
  ip_address: string | null
  user_agent: string | null
  request_id: string | null
  severity: AuditSeverity
  status: AuditStatus
  description: string | null
  entity_type: AuditEntityType | null
  created_at: string
  // Joined user data
  user?: {
    first_name: string | null
    last_name: string | null
    company_name: string | null
    email: string
    role: string
  } | null
}

export interface AuditLogFilters {
  user_id?: string
  user_roles?: string[]
  action_types?: string[]
  entity_types?: AuditEntityType[]
  status?: AuditStatus | 'all'
  severities?: AuditSeverity[]
  date_from?: string
  date_to?: string
}

export interface AuditLogPagination {
  page: number
  limit: number
}

// Helper function to get audit logs with filters and pagination
export const getAuditLogs = async (
  filters: AuditLogFilters = {},
  pagination: AuditLogPagination = { page: 1, limit: 25 }
): Promise<{ data: AuditLogEntry[], total: number }> => {
  try {
    const { page, limit } = pagination
    const offset = (page - 1) * limit

    // Build the query
    let query = supabase
      .from('audit_logs')
      .select(`
        *,
        user:users!user_id(
          first_name,
          last_name,
          company_name,
          email,
          role
        )
      `, { count: 'exact' })

    // Apply filters
    if (filters.user_id && filters.user_id !== 'all') {
      query = query.eq('user_id', filters.user_id)
    }

    if (filters.user_roles && filters.user_roles.length > 0) {
      // Filter by user roles - need to use a subquery approach
      const { data: userIds } = await supabase
        .from('users')
        .select('id')
        .in('role', filters.user_roles)
      
      if (userIds && userIds.length > 0) {
        query = query.in('user_id', userIds.map(u => u.id))
      }
    }

    if (filters.action_types && filters.action_types.length > 0) {
      query = query.in('action', filters.action_types)
    }

    if (filters.entity_types && filters.entity_types.length > 0) {
      query = query.in('entity_type', filters.entity_types)
    }

    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status)
    }

    if (filters.severities && filters.severities.length > 0) {
      query = query.in('severity', filters.severities)
    }

    if (filters.date_from) {
      query = query.gte('created_at', filters.date_from)
    }

    if (filters.date_to) {
      query = query.lte('created_at', filters.date_to)
    }

    // Apply ordering and pagination
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    const { data, error, count } = await query

    if (error) {
      console.warn('❌ Error fetching audit logs:', error.message)
      return { data: [], total: 0 }
    }

    return { 
      data: (data || []) as AuditLogEntry[], 
      total: count || 0 
    }
  } catch (error) {
    console.warn('❌ Failed to fetch audit logs:', error)
    return { data: [], total: 0 }
  }
}

// Helper function to get staff users for filter dropdown
export const getStaffUsers = async (): Promise<{ id: string, name: string, role: string }[]> => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, first_name, last_name, company_name, role')
      .in('role', ['admin', 'approver', 'assessor', 'verifier', 'reviewer', 'inspector'])
      .order('first_name', { ascending: true })

    if (error) {
      console.warn('❌ Error fetching staff users:', error.message)
      return []
    }

    return (data || []).map(user => ({
      id: user.id,
      name: user.company_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown',
      role: user.role
    }))
  } catch (error) {
    console.warn('❌ Failed to fetch staff users:', error)
    return []
  }
}

// Helper function to create an audit log entry
export const createAuditLog = async (params: {
  action: string
  entity_type?: AuditEntityType
  table_name?: string
  record_id?: string
  old_values?: any
  new_values?: any
  description?: string
  severity?: AuditSeverity
  status?: AuditStatus
  user_id?: string
}): Promise<boolean> => {
  try {
    // Get current user if not provided
    let userId = params.user_id
    if (!userId) {
      const { data: { user } } = await supabase.auth.getUser()
      userId = user?.id
    }

    // Get IP and user agent from browser if available
    const userAgent = typeof window !== 'undefined' ? window.navigator.userAgent : null

    const { error } = await supabase
      .from('audit_logs')
      .insert({
        user_id: userId || null,
        action: params.action,
        entity_type: params.entity_type || null,
        table_name: params.table_name || null,
        record_id: params.record_id || null,
        old_values: params.old_values || null,
        new_values: params.new_values || null,
        description: params.description || null,
        severity: params.severity || 'info',
        status: params.status || 'success',
        user_agent: userAgent,
        request_id: crypto.randomUUID()
      })

    if (error) {
      console.warn('❌ Error creating audit log:', error.message)
      return false
    }

    return true
  } catch (error) {
    console.warn('❌ Failed to create audit log:', error)
    return false
  }
}

// Helper function to get audit log stats for dashboard
export const getAuditLogStats = async (): Promise<{
  totalToday: number
  totalThisWeek: number
  criticalCount: number
  failedCount: number
}> => {
  try {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    // Get today's count
    const { count: totalToday } = await supabase
      .from('audit_logs')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfToday.toISOString())

    // Get this week's count
    const { count: totalThisWeek } = await supabase
      .from('audit_logs')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfWeek.toISOString())

    // Get critical count (last 7 days)
    const { count: criticalCount } = await supabase
      .from('audit_logs')
      .select('*', { count: 'exact', head: true })
      .eq('severity', 'critical')
      .gte('created_at', startOfWeek.toISOString())

    // Get failed count (last 7 days)
    const { count: failedCount } = await supabase
      .from('audit_logs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('created_at', startOfWeek.toISOString())

    return {
      totalToday: totalToday || 0,
      totalThisWeek: totalThisWeek || 0,
      criticalCount: criticalCount || 0,
      failedCount: failedCount || 0
    }
  } catch (error) {
    console.warn('❌ Failed to fetch audit log stats:', error)
    return {
      totalToday: 0,
      totalThisWeek: 0,
      criticalCount: 0,
      failedCount: 0
    }
  }
}

// ============================================
// ROLE DELEGATION (ACTING STAFF) FUNCTIONS
// ============================================

import type { RoleDelegation, RoleDelegationWithUsers, DelegatableRole, DelegationStatus } from '@/types/database'

export interface CreateDelegationParams {
  delegate_id: string
  delegated_role: DelegatableRole
  reason?: string
  start_date?: string
  end_date?: string | null
}

// Helper function to create a new role delegation
export const createRoleDelegation = async (params: CreateDelegationParams): Promise<RoleDelegation> => {
  try {
    // Get current user (delegator)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw new Error('You must be logged in to create a delegation')
    }

    // Validate that delegate exists and is active staff
    const { data: delegate, error: delegateError } = await supabase
      .from('users')
      .select('id, role, status')
      .eq('id', params.delegate_id)
      .single()

    if (delegateError || !delegate) {
      throw new Error('Selected delegate user not found')
    }

    if (delegate.status !== 'active') {
      throw new Error('Cannot delegate to an inactive user')
    }

    // Validate that the delegator has the role they're trying to delegate
    const { data: delegator, error: delegatorError } = await supabase
      .from('users')
      .select('id, role')
      .eq('id', user.id)
      .single()

    if (delegatorError || !delegator) {
      throw new Error('Could not verify your user information')
    }

    // Only allow delegating your own role (or admin can delegate any role)
    if (delegator.role !== 'admin' && delegator.role !== params.delegated_role) {
      throw new Error(`You can only delegate your own role (${delegator.role})`)
    }

    // Check if there's already an active delegation for this role from this user
    const { data: existingDelegation } = await supabase
      .from('role_delegations')
      .select('id')
      .eq('delegator_id', user.id)
      .eq('delegated_role', params.delegated_role)
      .eq('status', 'active')
      .single()

    if (existingDelegation) {
      throw new Error(`You already have an active delegation for the ${params.delegated_role} role. Please revoke it first.`)
    }

    // Create the delegation
    const delegationData = {
      delegator_id: user.id,
      delegate_id: params.delegate_id,
      delegated_role: params.delegated_role,
      reason: params.reason || null,
      start_date: params.start_date || new Date().toISOString(),
      end_date: params.end_date || null,
      status: 'active' as DelegationStatus,
    }

    const { data, error } = await supabase
      .from('role_delegations')
      .insert([delegationData])
      .select()
      .single()

    if (error) {
      console.error('❌ Error creating delegation:', error)
      throw new Error(`Failed to create delegation: ${error.message}`)
    }

    // Log the delegation creation
    await createAuditLog({
      action: 'role_delegation.created',
      entity_type: 'user',
      table_name: 'role_delegations',
      record_id: data.id,
      new_values: delegationData,
      description: `Role ${params.delegated_role} delegated to user ${params.delegate_id}`,
      severity: 'warning',
      status: 'success',
    })

    console.log('✅ Role delegation created successfully')
    return data
  } catch (error) {
    console.error('❌ Failed to create role delegation:', error)
    throw error
  }
}

// Helper function to get all role delegations (for admin view)
export const getAllRoleDelegations = async (): Promise<RoleDelegationWithUsers[]> => {
  try {
    // First, expire any ended delegations
    await expireEndedDelegations()

    const { data, error } = await supabase
      .from('role_delegations')
      .select(`
        *,
        delegator:users!delegator_id(
          id,
          email,
          first_name,
          last_name,
          role
        ),
        delegate:users!delegate_id(
          id,
          email,
          first_name,
          last_name,
          role
        ),
        revoker:users!revoked_by(
          id,
          email,
          first_name,
          last_name
        )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      console.warn('❌ Error fetching role delegations:', error.message)
      return []
    }

    return (data || []) as RoleDelegationWithUsers[]
  } catch (error) {
    console.warn('❌ Failed to fetch role delegations:', error)
    return []
  }
}

// Helper function to get delegations for a specific user (as delegator or delegate)
export const getUserDelegations = async (userId?: string): Promise<RoleDelegationWithUsers[]> => {
  try {
    // Get current user if not specified
    if (!userId) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []
      userId = user.id
    }

    // First, expire any ended delegations
    await expireEndedDelegations()

    const { data, error } = await supabase
      .from('role_delegations')
      .select(`
        *,
        delegator:users!delegator_id(
          id,
          email,
          first_name,
          last_name,
          role
        ),
        delegate:users!delegate_id(
          id,
          email,
          first_name,
          last_name,
          role
        )
      `)
      .or(`delegator_id.eq.${userId},delegate_id.eq.${userId}`)
      .order('created_at', { ascending: false })

    if (error) {
      console.warn('❌ Error fetching user delegations:', error.message)
      return []
    }

    return (data || []) as RoleDelegationWithUsers[]
  } catch (error) {
    console.warn('❌ Failed to fetch user delegations:', error)
    return []
  }
}

// Helper function to get active delegations where user is the delegate (acting roles)
export const getActiveDelegationsForDelegate = async (userId?: string): Promise<RoleDelegationWithUsers[]> => {
  try {
    // Get current user if not specified
    if (!userId) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []
      userId = user.id
    }

    // First, expire any ended delegations
    await expireEndedDelegations()

    const now = new Date().toISOString()

    const { data, error } = await supabase
      .from('role_delegations')
      .select(`
        *,
        delegator:users!delegator_id(
          id,
          email,
          first_name,
          last_name,
          role
        ),
        delegate:users!delegate_id(
          id,
          email,
          first_name,
          last_name,
          role
        )
      `)
      .eq('delegate_id', userId)
      .eq('status', 'active')
      .lte('start_date', now)
      .or(`end_date.is.null,end_date.gt.${now}`)
      .order('created_at', { ascending: false })

    if (error) {
      console.warn('❌ Error fetching active delegations for delegate:', error.message)
      return []
    }

    return (data || []) as RoleDelegationWithUsers[]
  } catch (error) {
    console.warn('❌ Failed to fetch active delegations for delegate:', error)
    return []
  }
}

// Helper function to revoke a role delegation
export const revokeRoleDelegation = async (
  delegationId: string, 
  reason?: string
): Promise<RoleDelegation> => {
  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw new Error('You must be logged in to revoke a delegation')
    }

    // Get the delegation to verify ownership
    const { data: delegation, error: fetchError } = await supabase
      .from('role_delegations')
      .select('*')
      .eq('id', delegationId)
      .single()

    if (fetchError || !delegation) {
      throw new Error('Delegation not found')
    }

    // Check if user is authorized to revoke (delegator or admin)
    const { data: currentUser } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (delegation.delegator_id !== user.id && currentUser?.role !== 'admin') {
      throw new Error('You are not authorized to revoke this delegation')
    }

    if (delegation.status !== 'active') {
      throw new Error('This delegation is already revoked or expired')
    }

    // Update the delegation
    const { data, error } = await supabase
      .from('role_delegations')
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        revoked_by: user.id,
        revocation_reason: reason || null,
      })
      .eq('id', delegationId)
      .select()
      .single()

    if (error) {
      console.error('❌ Error revoking delegation:', error)
      throw new Error(`Failed to revoke delegation: ${error.message}`)
    }

    // Log the revocation
    await createAuditLog({
      action: 'role_delegation.revoked',
      entity_type: 'user',
      table_name: 'role_delegations',
      record_id: delegationId,
      old_values: { status: 'active' },
      new_values: { status: 'revoked', revoked_at: data.revoked_at, revocation_reason: reason },
      description: `Role delegation ${delegationId} revoked${reason ? `: ${reason}` : ''}`,
      severity: 'warning',
      status: 'success',
    })

    console.log('✅ Role delegation revoked successfully')
    return data
  } catch (error) {
    console.error('❌ Failed to revoke role delegation:', error)
    throw error
  }
}

// Helper function to expire ended delegations
export const expireEndedDelegations = async (): Promise<void> => {
  try {
    const now = new Date().toISOString()

    const { error } = await supabase
      .from('role_delegations')
      .update({ status: 'expired' })
      .eq('status', 'active')
      .not('end_date', 'is', null)
      .lt('end_date', now)

    if (error) {
      console.warn('⚠️ Warning: Failed to expire ended delegations:', error.message)
    }
  } catch (error) {
    console.warn('⚠️ Warning: Failed to expire ended delegations:', error)
  }
}

// Helper function to check if a user has a specific delegated role
export const hasActiveDelegation = async (
  userId: string, 
  role: DelegatableRole
): Promise<boolean> => {
  try {
    await expireEndedDelegations()

    const now = new Date().toISOString()

    const { data, error } = await supabase
      .from('role_delegations')
      .select('id')
      .eq('delegate_id', userId)
      .eq('delegated_role', role)
      .eq('status', 'active')
      .lte('start_date', now)
      .or(`end_date.is.null,end_date.gt.${now}`)
      .limit(1)

    if (error) {
      console.warn('❌ Error checking active delegation:', error.message)
      return false
    }

    return (data?.length || 0) > 0
  } catch (error) {
    console.warn('❌ Failed to check active delegation:', error)
    return false
  }
}

// Helper function to get user's effective roles (own role + delegated roles)
export const getUserEffectiveRoles = async (userId?: string): Promise<string[]> => {
  try {
    // Get current user if not specified
    if (!userId) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []
      userId = user.id
    }

    // Get user's own role
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      return []
    }

    const roles: string[] = [user.role]

    // Get active delegated roles
    const delegations = await getActiveDelegationsForDelegate(userId)
    
    for (const delegation of delegations) {
      if (!roles.includes(delegation.delegated_role)) {
        roles.push(delegation.delegated_role)
      }
    }

    return roles
  } catch (error) {
    console.warn('❌ Failed to get user effective roles:', error)
    return []
  }
}

// Helper function to get staff users eligible to be delegates
export const getEligibleDelegates = async (excludeUserId?: string): Promise<{
  id: string
  email: string
  first_name?: string
  last_name?: string
  role: string
}[]> => {
  try {
    let query = supabase
      .from('users')
      .select('id, email, first_name, last_name, role')
      .in('role', ['reviewer', 'verifier', 'approver', 'assessor', 'inspector', 'admin'])
      .eq('status', 'active')
      .order('first_name', { ascending: true })

    if (excludeUserId) {
      query = query.neq('id', excludeUserId)
    }

    const { data, error } = await query

    if (error) {
      console.warn('❌ Error fetching eligible delegates:', error.message)
      return []
    }

    return data || []
  } catch (error) {
    console.warn('❌ Failed to fetch eligible delegates:', error)
    return []
  }
}

// Helper function to get delegation statistics
export const getDelegationStats = async (): Promise<{
  totalActive: number
  totalRevoked: number
  totalExpired: number
  byRole: Record<string, number>
}> => {
  try {
    await expireEndedDelegations()

    const { data, error } = await supabase
      .from('role_delegations')
      .select('status, delegated_role')

    if (error) {
      console.warn('❌ Error fetching delegation stats:', error.message)
      return { totalActive: 0, totalRevoked: 0, totalExpired: 0, byRole: {} }
    }

    const stats = {
      totalActive: 0,
      totalRevoked: 0,
      totalExpired: 0,
      byRole: {} as Record<string, number>
    }

    (data || []).forEach(d => {
      if (d.status === 'active') stats.totalActive++
      else if (d.status === 'revoked') stats.totalRevoked++
      else if (d.status === 'expired') stats.totalExpired++

      if (d.status === 'active') {
        stats.byRole[d.delegated_role] = (stats.byRole[d.delegated_role] || 0) + 1
      }
    })

    return stats
  } catch (error) {
    console.warn('❌ Failed to fetch delegation stats:', error)
    return { totalActive: 0, totalRevoked: 0, totalExpired: 0, byRole: {} }
  }
} 