import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Application, ApplicationFilters } from '@/types/database'
import { getApplicationExpiration } from '@/lib/application-expiration'

interface UseApplicationsOptions {
  userId?: string
  filters?: ApplicationFilters
  autoFetch?: boolean
}

interface UseApplicationsReturn {
  applications: Application[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  createApplication: (data: Partial<Application>) => Promise<Application | null>
  updateApplication: (id: string, data: Partial<Application>) => Promise<Application | null>
  deleteApplication: (id: string) => Promise<boolean>
  getApplication: (id: string) => Promise<Application | null>
  getApplicationByNumber: (applicationNumber: string) => Promise<Application | null>
}

export function useApplications({
  userId,
  filters,
  autoFetch = true
}: UseApplicationsOptions = {}): UseApplicationsReturn {
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchApplications = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Simple query without complex joins to avoid RLS issues
      let query = supabase
        .from('applications')
        .select('*')

      // Apply filters
      if (userId) {
        query = query.eq('applicant_id', userId)
      }

      if (filters?.status) {
        query = query.in('status', filters.status)
      }

      if (filters?.type) {
        query = query.in('application_type', filters.type)
      }

      if (filters?.province) {
        query = query.in('province', filters.province)
      }

      if (filters?.water_source) {
        query = query.in('water_source', filters.water_source)
      }

      if (filters?.sla_status) {
        query = query.in('sla_status', filters.sla_status)
      }

      if (filters?.assigned_reviewer_id) {
        query = query.eq('assigned_reviewer_id', filters.assigned_reviewer_id)
      }

      if (filters?.assigned_assessor_id) {
        query = query.eq('assigned_assessor_id', filters.assigned_assessor_id)
      }

      if (filters?.assigned_inspector_id) {
        query = query.eq('assigned_inspector_id', filters.assigned_inspector_id)
      }

      if (filters?.date_range) {
        query = query
          .gte('created_at', filters.date_range.from)
          .lte('created_at', filters.date_range.to)
      }

      // Order by created_at desc by default
      query = query.order('created_at', { ascending: false })

      const { data, error } = await query

      if (error) throw error

      setApplications(data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch applications')
      console.error('Error fetching applications:', err)
    } finally {
      setLoading(false)
    }
  }, [userId, filters])

  const createApplication = useCallback(async (data: Partial<Application>): Promise<Application | null> => {
    try {
      setError(null)
      
      const { data: newApplication, error } = await supabase
        .from('applications')
        .insert([data])
        .select()
        .single()

      if (error) throw error

      if (!newApplication) {
        throw new Error('No application data returned from database');
      }

      // ⚡ PERFORMANCE: Update local state instead of full refresh
      setApplications(prev => [newApplication, ...prev])

      return newApplication
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create application')
      console.error('Error creating application:', err)
      return null
    }
  }, [])

  const updateApplication = useCallback(async (id: string, data: Partial<Application>): Promise<Application | null> => {
    try {
      setError(null)
      let workingData: Partial<Application> = data
      
      // First, check if the application is immutable (approved/rejected/expired), and enforce expiration rule.
      // We fetch submitted_at so we can apply the 6-month expiry rule from the time of submission.
      if (!workingData.status || (workingData.status !== 'approved' && workingData.status !== 'rejected' && workingData.status !== 'expired')) {
        const { data: currentApp, error: fetchError } = await supabase
          .from('applications')
          .select('status, submitted_at')
          .eq('id', id)
          .single()
        
        if (fetchError) throw fetchError

        // Permit issuance is represented by a row in `permits` tied to the application.
        // This is the most reliable signal that the permit was actually issued.
        const { data: permitRow } = await supabase
          .from('permits')
          .select('id')
          .eq('application_id', id)
          .limit(1)
          .maybeSingle()

        const expiration = getApplicationExpiration({
          submitted_at: (currentApp as any)?.submitted_at ?? null,
          hasPermit: Boolean(permitRow?.id),
        })

        if (expiration.isExpired) {
          // Best-effort: mark as expired in DB (requires enum value + RLS allowing it).
          try {
            await supabase
              .from('applications')
              .update({ status: 'expired' as any, updated_at: new Date().toISOString() })
              .eq('id', id)
          } catch (e) {
            console.warn('⚠️ Failed to set status=expired (best-effort). Continuing to block edits.', e)
          }
          throw new Error('This application has expired (6 months since submission) and can no longer be edited or submitted.')
        }

        if (currentApp?.status === 'approved' || currentApp?.status === 'rejected' || currentApp?.status === 'expired') {
          throw new Error('Approved, rejected, or expired applications cannot be edited. Please contact an administrator if changes are needed.')
        }

        // Update submitted_at:
        // - On first submission (when submitted_at doesn't exist yet)
        // - On resubmission after correction (when current status is 'revision_required')
        //   so that the latest submission date reflects when the corrected application was resubmitted.
        const isSubmitting = ['submitted', 'pending_assessment'].includes((workingData as any)?.status);
        const isFirstSubmission = !(currentApp as any)?.submitted_at;
        const isResubmissionAfterCorrection = currentApp?.status === 'revision_required';
        if (isSubmitting && (isFirstSubmission || isResubmissionAfterCorrection)) {
          workingData = { ...workingData, submitted_at: new Date().toISOString() }
        }
      }

      // 🔒 Safety: normalize legacy enum values before hitting PostgREST.
      // Some environments previously stored/used "aquaculture" but DB enum was migrated.
      const safeData: Partial<Application> = { ...workingData }
      if ((safeData as any).water_purpose === 'aquaculture') {
        ;(safeData as any).water_purpose = 'fish_farming_lakes'
      }

      const isFetchFailure = (e: unknown) =>
        e instanceof TypeError ||
        (e && typeof e === 'object' && 'message' in e && typeof (e as any).message === 'string' && (e as any).message.includes('Failed to fetch'))

      const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
      
      // Use maybeSingle() so we can provide a clearer error when 0 rows are updated (common with RLS or wrong ID)
      const attemptUpdate = async () =>
        supabase
          .from('applications')
          .update(safeData)
          .eq('id', id)
          .select()
          .maybeSingle()

      let resp = await attemptUpdate()
      // 🚑 Retry once on transient network errors (sequential, no races).
      if (resp.error && isFetchFailure(resp.error)) {
        console.warn('⚠️ Supabase update fetch failed; retrying once...', resp.error)
        await delay(600)
        resp = await attemptUpdate()
      }

      const { data: updatedApplication, error } = resp

      if (error) throw error

      if (!updatedApplication) {
        throw new Error('Update returned no rows. The application may not exist or you may not have permission to update it.');
      }

      // Type the updated application correctly
      const typedApplication = updatedApplication as Application;

      // Update local state
      setApplications(prev => 
        prev.map(app => 
          app.id === id ? { ...app, ...typedApplication } : app
        )
      )

      return typedApplication
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'message' in err && typeof (err as any).message === 'string'
          ? (err as any).message
          : (err instanceof Error ? err.message : 'Failed to update application')

      setError(message)

      // PostgrestError often shows as {} in Next overlay; log key fields explicitly.
      const details = err && typeof err === 'object' && 'details' in err ? (err as any).details : undefined
      const hint = err && typeof err === 'object' && 'hint' in err ? (err as any).hint : undefined
      const code = err && typeof err === 'object' && 'code' in err ? (err as any).code : undefined
      console.error('Error updating application:', { message, details, hint, code, err })
      // Propagate the error to callers so UI can show the real reason (RLS, constraints, invalid enums, etc.)
      throw new Error(message)
    }
  }, [])

  const deleteApplication = useCallback(async (id: string): Promise<boolean> => {
    try {
      setError(null)
      const { error } = await supabase
        .from('applications')
        .delete()
        .eq('id', id)

      if (error) throw error

      // Remove from local state
      setApplications(prev => prev.filter(app => app.id !== id))

      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete application')
      console.error('Error deleting application:', err)
      return false
    }
  }, [])

  const getApplication = useCallback(async (id: string): Promise<Application | null> => {
    try {
      setError(null)
      
      // ⚡ PERFORMANCE: Check local cache first
      const cachedApp = applications.find(app => app.id === id)
      if (cachedApp) {
        return cachedApp
      }
      
      // Simplified query to avoid join issues with nullable foreign keys
      const { data, error } = await supabase
        .from('applications')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error

      // ⚡ PERFORMANCE: Update cache with fetched application
      if (data) {
        setApplications(prev => {
          const exists = prev.some(app => app.id === data.id)
          return exists ? prev : [data, ...prev]
        })
      }

      return data
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch application')
      console.error('Error fetching application:', err)
      return null
    }
  }, [applications])

  const getApplicationByNumber = useCallback(async (applicationNumber: string): Promise<Application | null> => {
    try {
      setError(null)

      // First get the basic application data
      const { data: application, error } = await supabase
        .from('applications')
        .select('*')
        .eq('application_number', applicationNumber)
        .single()

      if (error) {
        console.error('Error fetching application by number:', error)
        throw error
      }

      if (!application) {
        return null
      }

      // Fetch related data separately to avoid relationship issues
      const [
        applicantResult, 
        documentsResult, 
        reviewsResult, 
        inspectionsResult, 
        permitsResult,
        assignedReviewerResult,
        assignedInspectorResult,
        assignedApproverResult
      ] = await Promise.all([
        // Fetch applicant data
        supabase
          .from('users')
          .select(`
            id,
            first_name,
            last_name,
            email,
            phone,
            mobile_phone,
            account_type,
            company_name,
            company_tin,
            incorporation_certificate_number,
            id_number,
            date_of_birth,
            province,
            district,
            sector,
            cell,
            village,
            address,
            created_at,
            last_login_at
          `)
          .eq('id', application.applicant_id)
          .single(),
        
        // Fetch documents
        supabase
          .from('documents')
          .select('*')
          .eq('application_id', application.id),
          
        // Fetch reviews
        supabase
          .from('reviews')
          .select('*')
          .eq('application_id', application.id),
          
        // Fetch inspections
        supabase
          .from('inspections')
          .select('*')
          .eq('application_id', application.id),
          
        // Fetch permits
        supabase
          .from('permits')
          .select('*')
          .eq('application_id', application.id),

        // Fetch assigned reviewer if exists
        application.assigned_reviewer_id 
          ? supabase
              .from('users')
              .select('id, first_name, last_name, email')
              .eq('id', application.assigned_reviewer_id)
              .single()
          : Promise.resolve({ data: null, error: null }),

        // Fetch assigned inspector if exists
        application.assigned_inspector_id 
          ? supabase
              .from('users')
              .select('id, first_name, last_name, email')
              .eq('id', application.assigned_inspector_id)
              .single()
          : Promise.resolve({ data: null, error: null }),

        // Fetch assigned approver if exists
        application.assigned_approver_id 
          ? supabase
              .from('users')
              .select('id, first_name, last_name, email')
              .eq('id', application.assigned_approver_id)
              .single()
          : Promise.resolve({ data: null, error: null })
      ])

      // Combine all data
      const enrichedApplication = {
        ...application,
        applicant: applicantResult.data || null,
        documents: documentsResult.data || [],
        reviews: reviewsResult.data || [],
        inspections: inspectionsResult.data || [],
        permits: permitsResult.data || [],
        assigned_reviewer: assignedReviewerResult.data || null,
        assigned_inspector: assignedInspectorResult.data || null,
        assigned_approver: assignedApproverResult.data || null
      }

      return enrichedApplication
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch application')
      console.error('Error fetching application by number:', err)
      return null
    }
  }, [])

  useEffect(() => {
    if (autoFetch) {
      fetchApplications()
    }
  }, [fetchApplications, autoFetch])

  return {
    applications,
    loading,
    error,
    refresh: fetchApplications,
    createApplication,
    updateApplication,
    deleteApplication,
    getApplication,
    getApplicationByNumber
  }
} 