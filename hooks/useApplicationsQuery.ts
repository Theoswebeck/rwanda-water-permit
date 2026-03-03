import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Application, ApplicationFilters } from '@/types/database'

// ⚡ PERFORMANCE: Query keys for cache management
export const applicationKeys = {
  all: ['applications'] as const,
  lists: () => [...applicationKeys.all, 'list'] as const,
  list: (filters: ApplicationFilters | undefined, userId?: string) => 
    [...applicationKeys.lists(), { filters, userId }] as const,
  details: () => [...applicationKeys.all, 'detail'] as const,
  detail: (id: string) => [...applicationKeys.details(), id] as const,
  byNumber: (number: string) => [...applicationKeys.all, 'byNumber', number] as const,
}

// ⚡ PERFORMANCE: Fetch applications with React Query caching
export function useApplicationsQuery(
  userId?: string,
  filters?: ApplicationFilters,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: applicationKeys.list(filters, userId),
    queryFn: async () => {
      // ⚡ FIX: Don't fetch if no userId
      if (!userId) {
        return []
      }

      const params = new URLSearchParams()
      if (filters?.status?.length) params.set('status', filters.status.join(','))
      if (filters?.type?.length) params.set('type', filters.type.join(','))
      if (filters?.province?.length) params.set('province', filters.province.join(','))
      const qs = params.toString()

      const response = await fetch(`/api/dashboard/applications${qs ? `?${qs}` : ''}`, {
        method: 'GET',
        cache: 'no-store',
      })
      const json = await response.json().catch(() => null)

      if (!response.ok || !json?.success) {
        throw new Error(json?.message || 'Failed to fetch applications')
      }
      return (json.applications || []) as Application[]
    },
    // ⚡ FIX: Only enable when we have a valid userId
    enabled: enabled && !!userId,
    // ⚡ Keep applications fresh for 2 minutes
    staleTime: 2 * 60 * 1000,
    // ⚡ FIX: Add retry and timeout settings
    retry: 1,
    retryDelay: 1000,
  })
}

// ⚡ PERFORMANCE: Fetch single application with caching
export function useApplicationQuery(id: string, enabled: boolean = true) {
  return useQuery({
    queryKey: applicationKeys.detail(id),
    queryFn: async () => {
      const response = await fetch('/api/dashboard/applications', { method: 'GET', cache: 'no-store' })
      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.success) {
        throw new Error(json?.message || 'Failed to fetch applications')
      }
      const app = ((json.applications || []) as Application[]).find((a) => a.id === id) || null
      if (!app) throw new Error('Application not found')
      return app
    },
    enabled: enabled && !!id,
    staleTime: 5 * 60 * 1000,
  })
}

// ⚡ PERFORMANCE: Fetch application by number with related data
export function useApplicationByNumberQuery(applicationNumber: string, enabled: boolean = true) {
  return useQuery({
    queryKey: applicationKeys.byNumber(applicationNumber),
    queryFn: async () => {
      const response = await fetch('/api/dashboard/applications', { method: 'GET', cache: 'no-store' })
      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.success) {
        throw new Error(json?.message || 'Failed to fetch applications')
      }
      const app =
        ((json.applications || []) as Application[]).find((a) => a.application_number === applicationNumber) || null
      return app
    },
    enabled: enabled && !!applicationNumber,
    staleTime: 5 * 60 * 1000,
  })
}

// ⚡ PERFORMANCE: Mutation for updating applications with optimistic updates
export function useUpdateApplicationMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Application> }) => {
      throw new Error('Direct application updates are not supported in self-hosted Phase 2 hook. Use route-specific APIs.')
    },
    onSuccess: (data) => {
      // ⚡ Update cache immediately
      queryClient.setQueryData(applicationKeys.detail(data.id), data)
      // Invalidate list queries to refresh them
      queryClient.invalidateQueries({ queryKey: applicationKeys.lists() })
    },
  })
}

// ⚡ PERFORMANCE: Mutation for creating applications
export function useCreateApplicationMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: Partial<Application>) => {
      throw new Error('Direct application creation is not supported in self-hosted Phase 2 hook. Use app APIs.')
    },
    onSuccess: () => {
      // Invalidate all application lists
      queryClient.invalidateQueries({ queryKey: applicationKeys.lists() })
    },
  })
}

// ⚡ PERFORMANCE: Mutation for deleting applications
export function useDeleteApplicationMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/dashboard/applications/${id}`, { method: 'DELETE' })
      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.success) {
        throw new Error(json?.message || 'Failed to delete application')
      }
      return id
    },
    onSuccess: (deletedId) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: applicationKeys.detail(deletedId) })
      // Invalidate lists
      queryClient.invalidateQueries({ queryKey: applicationKeys.lists() })
    },
  })
}

