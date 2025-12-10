import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
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
      let query = supabase
        .from('applications')
        .select('*')

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

      query = query.order('created_at', { ascending: false })

      const { data, error } = await query

      if (error) throw error
      return data || []
    },
    enabled,
    // ⚡ Keep applications fresh for 2 minutes
    staleTime: 2 * 60 * 1000,
  })
}

// ⚡ PERFORMANCE: Fetch single application with caching
export function useApplicationQuery(id: string, enabled: boolean = true) {
  return useQuery({
    queryKey: applicationKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('applications')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error
      return data
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
      // Get basic application data
      const { data: application, error } = await supabase
        .from('applications')
        .select('*')
        .eq('application_number', applicationNumber)
        .single()

      if (error) throw error
      if (!application) return null

      // ⚡ PERFORMANCE: Fetch related data in parallel
      const [
        applicantResult,
        documentsResult,
        reviewsResult,
      ] = await Promise.all([
        supabase
          .from('users')
          .select('id, first_name, last_name, email, phone, account_type, company_name')
          .eq('id', application.applicant_id)
          .single(),
        supabase
          .from('documents')
          .select('*')
          .eq('application_id', application.id),
        supabase
          .from('reviews')
          .select('*')
          .eq('application_id', application.id)
          .order('created_at', { ascending: false }),
      ])

      return {
        ...application,
        applicant: applicantResult.data || null,
        documents: documentsResult.data || [],
        reviews: reviewsResult.data || [],
      }
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
      const { data: updated, error } = await supabase
        .from('applications')
        .update(data)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return updated
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
      const { data: created, error } = await supabase
        .from('applications')
        .insert([data])
        .select()
        .single()

      if (error) throw error
      return created
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
      const { error } = await supabase
        .from('applications')
        .delete()
        .eq('id', id)

      if (error) throw error
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

