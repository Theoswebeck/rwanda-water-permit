import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Permit } from '@/types/database'

// ⚡ PERFORMANCE: Query keys for cache management
export const permitKeys = {
  all: ['permits'] as const,
  lists: () => [...permitKeys.all, 'list'] as const,
  list: (userId?: string) => [...permitKeys.lists(), { userId }] as const,
  details: () => [...permitKeys.all, 'detail'] as const,
  detail: (id: string) => [...permitKeys.details(), id] as const,
}

interface UsePermitsQueryOptions {
  userId?: string
  enabled?: boolean
}

// ⚡ PERFORMANCE: Fetch permits with React Query caching
export function usePermitsQuery({ userId, enabled = true }: UsePermitsQueryOptions = {}) {
  return useQuery({
    queryKey: permitKeys.list(userId),
    queryFn: async (): Promise<Permit[]> => {
      if (userId) {
        // First get the user's application IDs
        const { data: userApplications, error: appsError } = await supabase
          .from('applications')
          .select('id')
          .eq('applicant_id', userId)

        if (appsError) throw appsError

        const applicationIds = userApplications?.map(app => app.id) || []

        if (applicationIds.length === 0) {
          return []
        }

        // Get permits for those applications
        const { data, error } = await supabase
          .from('permits')
          .select('*')
          .in('application_id', applicationIds)
          .order('issued_date', { ascending: false })

        if (error) throw error
        return data || []
      } else {
        // No userId, fetch all permits
        const { data, error } = await supabase
          .from('permits')
          .select('*')
          .order('issued_date', { ascending: false })

        if (error) throw error
        return data || []
      }
    },
    enabled,
    // ⚡ Permits change less frequently, keep fresh for 5 minutes
    staleTime: 5 * 60 * 1000,
  })
}

