import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
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
  application?: {
    id: string
    application_number: string
    project_title: string
    intended_activities: string[] | null
    province: string
    district: string
    sector: string
    cell: string
    village?: string
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
      
      // First get the user's application IDs
      const { data: userApplications, error: appsError } = await supabase
        .from('applications')
        .select('id')
        .eq('applicant_id', userId)

      if (appsError) {
        console.error('❌ Error fetching user applications for permits:', appsError.message)
        throw appsError
      }

      const applicationIds = userApplications?.map(app => app.id) || []

      if (applicationIds.length === 0) {
        return []
      }

      // Get permits for those applications with optional application data
      const selectQuery = includeApplication 
        ? `*, application:applications!application_id(id, application_number, project_title, intended_activities, province, district, sector, cell, village, water_body_name, max_daily_volume_m3, max_yearly_volume_m3, concession_area)`
        : '*'

      const { data, error } = await supabase
        .from('permits')
        .select(selectQuery)
        .in('application_id', applicationIds)
        .order('issued_date', { ascending: false })

      if (error) {
        console.error('❌ Error fetching permits:', error.message)
        throw error
      }
      return data || []
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

