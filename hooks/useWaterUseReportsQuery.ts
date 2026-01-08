import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { WaterUseReport } from '@/types/database'

export const waterUseReportKeys = {
  all: ['waterUseReports'] as const,
  lists: () => [...waterUseReportKeys.all, 'list'] as const,
  list: (userId?: string) => [...waterUseReportKeys.lists(), { userId }] as const,
  details: () => [...waterUseReportKeys.all, 'detail'] as const,
  detail: (id: string) => [...waterUseReportKeys.details(), id] as const,
  byPermitYear: (permitId: string, reportingYear: number) =>
    [...waterUseReportKeys.all, 'byPermitYear', { permitId, reportingYear }] as const,
}

export function useWaterUseReportsQuery(userId?: string, enabled: boolean = true) {
  return useQuery({
    queryKey: waterUseReportKeys.list(userId),
    queryFn: async (): Promise<WaterUseReport[]> => {
      if (!userId) return []

      const { data, error } = await supabase
        .from('water_use_reports')
        .select('*')
        .eq('applicant_id', userId)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('❌ Error fetching water use reports:', error.message)
        throw error
      }

      return data || []
    },
    enabled: enabled && !!userId,
    staleTime: 2 * 60 * 1000,
    retry: 1,
    retryDelay: 1000,
  })
}

export function useWaterUseReportQuery(id: string, enabled: boolean = true) {
  return useQuery({
    queryKey: waterUseReportKeys.detail(id),
    queryFn: async (): Promise<WaterUseReport> => {
      const { data, error } = await supabase
        .from('water_use_reports')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error
      return data as WaterUseReport
    },
    enabled: enabled && !!id,
    staleTime: 5 * 60 * 1000,
  })
}

export function useWaterUseReportByPermitYearQuery(
  permitId: string,
  reportingYear: number,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: waterUseReportKeys.byPermitYear(permitId, reportingYear),
    queryFn: async (): Promise<WaterUseReport | null> => {
      const { data, error } = await supabase
        .from('water_use_reports')
        .select('*')
        .eq('permit_id', permitId)
        .eq('reporting_year', reportingYear)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') throw error
      return (data as WaterUseReport) || null
    },
    enabled: enabled && !!permitId && !!reportingYear,
    staleTime: 30 * 1000,
    retry: 1,
    retryDelay: 1000,
  })
}

export function useCreateWaterUseReportMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: Partial<WaterUseReport>) => {
      const { data: created, error } = await supabase
        .from('water_use_reports')
        .insert([data])
        .select()
        .single()

      if (error) throw error
      return created as WaterUseReport
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: waterUseReportKeys.lists() })
    },
  })
}

export function useUpdateWaterUseReportMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<WaterUseReport> }) => {
      const { data: updated, error } = await supabase
        .from('water_use_reports')
        .update(data)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return updated as WaterUseReport
    },
    onSuccess: (data) => {
      queryClient.setQueryData(waterUseReportKeys.detail(data.id), data)
      queryClient.invalidateQueries({ queryKey: waterUseReportKeys.lists() })
    },
  })
}


