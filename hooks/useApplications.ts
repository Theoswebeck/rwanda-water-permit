import { useState, useEffect, useCallback } from 'react'
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
      const params = new URLSearchParams()
      if (filters?.status?.length) params.set('status', filters.status.join(','))
      if (filters?.type?.length) params.set('type', filters.type.join(','))
      if (filters?.province?.length) params.set('province', filters.province.join(','))
      const res = await fetch(`/api/dashboard/applications${params.toString() ? `?${params.toString()}` : ''}`, {
        method: 'GET',
        cache: 'no-store',
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || 'Failed to fetch applications')
      }
      setApplications((json.applications || []) as Application[])
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
      const res = await fetch('/api/dashboard/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || 'Failed to create application')
      }
      const created = (json.application || null) as Application | null
      if (created) setApplications((prev) => [created, ...prev])
      return created
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create application')
      console.error('Error creating application:', err)
      return null
    }
  }, [])

  const updateApplication = useCallback(async (id: string, data: Partial<Application>): Promise<Application | null> => {
    try {
      setError(null)
      const res = await fetch(`/api/dashboard/applications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || 'Failed to update application')
      }
      const updated = (json.application || null) as Application | null
      if (updated) {
        setApplications((prev) => prev.map((app) => (app.id === id ? { ...app, ...updated } : app)))
      }
      return updated
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update application'
      setError(message)
      console.error('Error updating application:', err)
      throw new Error(message)
    }
  }, [])

  const deleteApplication = useCallback(async (id: string): Promise<boolean> => {
    try {
      setError(null)
      const res = await fetch(`/api/dashboard/applications/${id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) throw new Error(json?.message || 'Failed to delete application')

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
      const res = await fetch(`/api/dashboard/applications/${id}`, { method: 'GET', cache: 'no-store' })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) throw new Error(json?.message || 'Failed to fetch application')
      const data = (json.application || null) as Application | null
      if (data) setApplications((prev) => (prev.some((a) => a.id === data.id) ? prev.map((a) => (a.id === data.id ? data : a)) : [data, ...prev]))
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
      const res = await fetch(
        `/api/dashboard/applications/by-number/${encodeURIComponent(applicationNumber)}`,
        { method: 'GET', cache: 'no-store' }
      )
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) throw new Error(json?.message || 'Failed to fetch application')
      return (json.application || null) as Application | null
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