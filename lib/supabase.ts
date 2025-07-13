import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
})

// Helper function to get the current user
export const getCurrentUser = async () => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) {
      // Return a mock user for now since auth is not implemented
      console.warn('Auth not implemented, using mock user')
      return {
        id: 'mock-inspector-id',
        app_metadata: {
          role: 'inspector'
        }
      }
    }
    return user
  } catch (error) {
    // Return a mock user for now since auth is not implemented
    console.warn('Auth not implemented, using mock user')
    return {
      id: 'mock-inspector-id',
      app_metadata: {
        role: 'inspector'
      }
    }
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
export const updateApplicationStatus = async (applicationId: string, status: string) => {
  const { data, error } = await supabase
    .from('applications')
    .update({ status })
    .eq('id', applicationId)
    .select()
    .single()
  
  if (error) throw error
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