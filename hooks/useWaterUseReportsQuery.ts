import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
      const response = await fetch('/api/water-use-reports?includeRelations=false', {
        method: 'GET',
        cache: 'no-store',
      })
      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.success) {
        throw new Error(json?.message || 'Failed to fetch water use reports')
      }
      return (json.reports || []) as WaterUseReport[]
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
      const response = await fetch(`/api/water-use-reports/${id}`, {
        method: 'GET',
        cache: 'no-store',
      })
      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.success) throw new Error(json?.message || 'Failed to fetch report')
      return json.report as WaterUseReport
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
      const response = await fetch(
        `/api/water-use-reports?permitId=${encodeURIComponent(permitId)}&reportingYear=${encodeURIComponent(
          String(reportingYear)
        )}&includeRelations=false`,
        { method: 'GET', cache: 'no-store' }
      )
      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.success) throw new Error(json?.message || 'Failed to fetch report')
      const rows = (json.reports || []) as WaterUseReport[]
      return rows[0] || null
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
      const response = await fetch('/api/water-use-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.success) throw new Error(json?.message || 'Failed to create report')
      return json.report as WaterUseReport
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
      const response = await fetch(`/api/water-use-reports/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.success) throw new Error(json?.message || 'Failed to update report')
      return json.report as WaterUseReport
    },
    onSuccess: (data) => {
      queryClient.setQueryData(waterUseReportKeys.detail(data.id), data)
      queryClient.invalidateQueries({ queryKey: waterUseReportKeys.lists() })
    },
  })
}


