import { useState, useEffect, useCallback } from 'react'
import type { Permit } from '@/types/database'

interface UsePermitsOptions {
  userId?: string
  filters?: {
    status?: string[]
    expiring_soon?: boolean
  }
  autoFetch?: boolean
}

interface UsePermitsReturn {
  permits: Permit[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  getPermit: (id: string) => Promise<Permit | null>
}

export function usePermits({
  userId,
  filters,
  autoFetch = true
}: UsePermitsOptions = {}): UsePermitsReturn {
  const [permits, setPermits] = useState<Permit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPermits = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/dashboard/permits?includeApplication=false', {
        method: 'GET',
        cache: 'no-store',
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) throw new Error(json?.message || 'Failed to fetch permits')
      let rows = (json.permits || []) as Permit[]
      if (filters?.status?.length) {
        rows = rows.filter((row: any) => filters.status?.includes(String(row.status)))
      }
      if (filters?.expiring_soon) {
        const threshold = new Date()
        threshold.setDate(threshold.getDate() + 30)
        rows = rows.filter((row: any) => {
          const expiry = row?.expiry_date ? new Date(String(row.expiry_date)) : null
          return !!expiry && expiry <= threshold
        })
      }
      setPermits(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch permits')
      console.error('Error fetching permits:', err)
    } finally {
      setLoading(false)
    }
  }, [userId, filters])

  const getPermit = useCallback(async (id: string): Promise<Permit | null> => {
    try {
      setError(null)
      const res = await fetch('/api/dashboard/permits?includeApplication=false', {
        method: 'GET',
        cache: 'no-store',
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) throw new Error(json?.message || 'Failed to fetch permit')
      const found = ((json.permits || []) as Permit[]).find((p: any) => String((p as any).id) === id) || null
      return found
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch permit')
      console.error('Error fetching permit:', err)
      return null
    }
  }, [])

  useEffect(() => {
    if (autoFetch) {
      fetchPermits()
    }
  }, [fetchPermits, autoFetch])

  return {
    permits,
    loading,
    error,
    refresh: fetchPermits,
    getPermit
  }
} 