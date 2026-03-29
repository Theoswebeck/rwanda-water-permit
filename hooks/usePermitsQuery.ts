import { useQuery } from '@tanstack/react-query'
import type { Permit } from '@/types/database'

// ⚡ PERFORMANCE: Query keys for cache management
export const permitKeys = {
  all: ['permits'] as const,
  lists: () => [...permitKeys.all, 'list'] as const,
  list: (userId?: string) => [...permitKeys.lists(), { userId }] as const,
  listWithApps: (userId?: string) => [...permitKeys.lists(), 'withApps', { userId }] as const,
  details: () => [...permitKeys.all, 'detail'] as const,
  detail: (id: string) => [...permitKeys.details(), id] as const,
}

export interface PermitWithApplication extends Permit {
  /**
   * Denormalized fields (optional, environment-dependent).
   * Some deployments attach these via triggers/views; keep optional for compatibility.
   */
  modification_count?: number | null
  last_modified_at?: string | null
  application?: {
    id: string
    application_number: string
    project_title: string
    applicant?: {
      id: string
      first_name?: string
      last_name?: string
      company_name?: string
      email?: string
    }
    intended_activities: string[] | null
    province: string
    district: string
    sector: string
    cell: string
    village?: string
    internal_notes?: unknown
    water_body_name?: string
    max_daily_volume_m3?: number
    max_yearly_volume_m3?: number
    concession_area?: number
  }
}

interface UsePermitsQueryOptions {
  userId?: string
  enabled?: boolean
  includeApplication?: boolean
}

// ⚡ PERFORMANCE: Fetch permits with React Query caching
export function usePermitsQuery({ userId, enabled = true, includeApplication = true }: UsePermitsQueryOptions = {}) {
  return useQuery({
    queryKey: includeApplication ? permitKeys.listWithApps(userId) : permitKeys.list(userId),
    queryFn: async (): Promise<PermitWithApplication[]> => {
      // ⚡ FIX: Don't fetch if no userId
      if (!userId) {
        return []
      }

      const response = await fetch(
        `/api/dashboard/permits?includeApplication=${includeApplication ? 'true' : 'false'}`,
        {
          method: 'GET',
          cache: 'no-store',
        }
      )
      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.success) {
        throw new Error(json?.message || 'Failed to fetch permits')
      }
      return (json.permits || []) as PermitWithApplication[]
    },
    // ⚡ FIX: Only enable when we have a valid userId
    enabled: enabled && !!userId,
    // ⚡ Permits change less frequently, keep fresh for 5 minutes
    staleTime: 5 * 60 * 1000,
    // ⚡ FIX: Add retry settings
    retry: 1,
    retryDelay: 1000,
  })
}

