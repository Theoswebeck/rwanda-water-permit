import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Application, ApplicationFilters } from '@/types/database'

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
      
      // First, check if the application is approved or rejected (if we're not just updating status through admin/reviewer workflow)
      if (!data.status || (data.status !== 'approved' && data.status !== 'rejected')) {
        const { data: currentApp, error: fetchError } = await supabase
          .from('applications')
          .select('status')
          .eq('id', id)
          .single()
        
        if (fetchError) throw fetchError
        
        if (currentApp?.status === 'approved' || currentApp?.status === 'rejected') {
          throw new Error('Approved or rejected applications cannot be edited. Please contact an administrator if changes are needed.')
        }
      }
      
      const { data: updatedApplication, error } = await supabase
        .from('applications')
        .update(data)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      if (!updatedApplication) {
        throw new Error('No application data returned from database update');
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
      setError(err instanceof Error ? err.message : 'Failed to update application')
      console.error('Error updating application:', err)
      return null
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

      const { data, error } = await supabase
        .from('applications')
        .select(`
          *,
          applicant:users!applicant_id(
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
          ),
          assigned_reviewer:users!assigned_reviewer_id(
            id,
            first_name,
            last_name,
            email
          ),
          assigned_inspector:users!assigned_inspector_id(
            id,
            first_name,
            last_name,
            email
          ),
          assigned_approver:users!assigned_approver_id(
            id,
            first_name,
            last_name,
            email
          ),
          documents(*),
          reviews!application_id(*),
          inspections!application_id(*),
          permits!application_id(*)
        `)
        .eq('application_number', applicationNumber)
        .single()

      if (error) {
        console.error('Error fetching application by number:', error)
        throw error
      }

      return data
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