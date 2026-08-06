import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { WaterUseReport, WaterUseReportTemplate, WaterUseReportStatus } from '@/types/database'
import { selectWaterUseReportTemplate } from '@/lib/water-use-report-utils'

// ⚡ PERFORMANCE: Query keys for cache management
export const waterUseReportKeys = {
  all: ['water-use-reports'] as const,
  lists: () => [...waterUseReportKeys.all, 'list'] as const,
  listByUser: (userId?: string) => [...waterUseReportKeys.lists(), { userId }] as const,
  listByPermit: (permitId?: string) => [...waterUseReportKeys.lists(), { permitId }] as const,
  listAll: () => [...waterUseReportKeys.lists(), 'all'] as const,
  details: () => [...waterUseReportKeys.all, 'detail'] as const,
  detail: (id: string) => [...waterUseReportKeys.details(), id] as const,
}

export interface WaterUseReportWithRelations extends WaterUseReport {
  permit?: {
    id: string
    permit_number: string
    purpose: string
    water_source: string
    water_allowance: number
    allowance_unit: string
    issued_date: string
    expiry_date: string
  }
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
  applicant?: {
    id: string
    first_name?: string
    last_name?: string
    company_name?: string
    email: string
    phone?: string
  }
}

// Fetch water use reports for a specific user (applicant view)
export function useWaterUseReportsQuery(userId?: string, enabled: boolean = true) {
  return useQuery({
    queryKey: waterUseReportKeys.listByUser(userId),
    queryFn: async (): Promise<WaterUseReportWithRelations[]> => {
      if (!userId) return []
      const response = await fetch('/api/water-use-reports?includeRelations=true', {
        method: 'GET',
        cache: 'no-store',
      })
      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.success) {
        throw new Error(json?.message || 'Failed to fetch water use reports')
      }
      return (json.reports || []) as WaterUseReportWithRelations[]
    },
    enabled: enabled && !!userId,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  })
}

// Fetch all water use reports (staff view)
export function useAllWaterUseReportsQuery(enabled: boolean = true) {
  return useQuery({
    queryKey: waterUseReportKeys.listAll(),
    queryFn: async (): Promise<WaterUseReportWithRelations[]> => {
      const response = await fetch('/api/water-use-reports?includeRelations=true', {
        method: 'GET',
        cache: 'no-store',
      })
      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.success) {
        throw new Error(json?.message || 'Failed to fetch water use reports')
      }
      return (json.reports || []) as WaterUseReportWithRelations[]
    },
    enabled,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  })
}

// Fetch single water use report by ID
export function useWaterUseReportQuery(id: string, enabled: boolean = true) {
  return useQuery({
    queryKey: waterUseReportKeys.detail(id),
    queryFn: async (): Promise<WaterUseReportWithRelations | null> => {
      if (!id) return null
      const response = await fetch(`/api/water-use-reports/${id}`, {
        method: 'GET',
        cache: 'no-store',
      })
      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.success) {
        throw new Error(json?.message || 'Failed to fetch water use report')
      }
      return (json.report || null) as WaterUseReportWithRelations | null
    },
    enabled: enabled && !!id,
    staleTime: 5 * 60 * 1000,
  })
}

// Check if a report exists for a permit and year
export function useExistingReportCheck(permitId: string, reportingYear: number, enabled: boolean = true) {
  return useQuery({
    queryKey: [...waterUseReportKeys.listByPermit(permitId), reportingYear],
    queryFn: async (): Promise<WaterUseReport | null> => {
      if (!permitId || !reportingYear) return null
      const response = await fetch(
        `/api/water-use-reports?permitId=${encodeURIComponent(permitId)}&reportingYear=${encodeURIComponent(
          String(reportingYear)
        )}&includeRelations=false`,
        { method: 'GET', cache: 'no-store' }
      )
      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.success) {
        throw new Error(json?.message || 'Failed to check existing report')
      }
      const rows = (json.reports || []) as WaterUseReport[]
      return rows[0] || null
    },
    enabled: enabled && !!permitId && !!reportingYear,
    staleTime: 1 * 60 * 1000,
  })
}

// Create water use report mutation
export function useCreateWaterUseReportMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (reportData: Omit<WaterUseReport, 'id' | 'created_at' | 'updated_at'>) => {
      const response = await fetch('/api/water-use-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reportData),
      })
      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.success) {
        throw new Error(json?.message || 'Failed to create water use report')
      }
      return json.report as WaterUseReport
    },
    onSuccess: (data) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: waterUseReportKeys.lists() })
      console.log('✅ Water use report created:', data.id)
    },
  })
}

// Update water use report mutation
export function useUpdateWaterUseReportMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updateData }: Partial<WaterUseReport> & { id: string }) => {
      const response = await fetch(`/api/water-use-reports/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...updateData,
          updated_at: new Date().toISOString(),
        }),
      })
      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.success) {
        throw new Error(json?.message || 'Failed to update water use report')
      }
      return json.report as WaterUseReport
    },
    onSuccess: (data) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: waterUseReportKeys.lists() })
      queryClient.invalidateQueries({ queryKey: waterUseReportKeys.detail(data.id) })
      console.log('✅ Water use report updated:', data.id)
    },
  })
}

// Submit water use report mutation (changes status to submitted)
export function useSubmitWaterUseReportMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/water-use-reports/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'submitted',
          workflow_status: 'submitted',
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      })
      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.success) {
        throw new Error(json?.message || 'Failed to submit water use report')
      }
      return json.report as WaterUseReport
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: waterUseReportKeys.lists() })
      queryClient.invalidateQueries({ queryKey: waterUseReportKeys.detail(data.id) })
      console.log('✅ Water use report submitted:', data.id)
    },
  })
}

/**
 * Determine the report template from the permit purpose and/or the
 * application's intended activities. Pass the purpose whenever it is
 * available — activities alone miss permits whose activity list doesn't
 * name the concession activity (see selectWaterUseReportTemplate).
 */
export function getReportTemplate(
  intendedActivities: string[] | null | undefined,
  permitPurpose?: string | null,
): WaterUseReportTemplate {
  return selectWaterUseReportTemplate({
    permitPurpose: permitPurpose as never,
    applicationIntendedActivities: intendedActivities as never,
  })
}

// Helper to get water use type options based on template
export function getWaterUseTypeOptions(template: WaterUseReportTemplate) {
  if (template === 'concession') {
    return [
      { value: 'recreation', label: 'Recreation' },
      { value: 'fish_farming_lakes', label: 'Fish Farming in Lake' },
      { value: 'gas_extraction', label: 'Gas Extraction' },
      { value: 'port', label: 'Port' },
      { value: 'other', label: 'Other' },
    ]
  }

  return [
    { value: 'irrigation', label: 'Irrigation' },
    { value: 'fish_farming_ponds', label: 'Fish Farming in Ponds' },
    { value: 'industry', label: 'Industry' },
    { value: 'coffee_washing', label: 'Coffee Washing' },
    { value: 'construction_banks', label: 'Construction of Infrastructures on Banks/Rivers/Lakes' },
    { value: 'construction_dam', label: 'Construction of a Dam' },
    { value: 'mining', label: 'Mining' },
    { value: 'water_supply', label: 'Water Supply' },
    { value: 'electricity_generation', label: 'Electricity Generation' },
    { value: 'other', label: 'Other' },
  ]
}

// Helper to get water source type options
export function getWaterSourceTypeOptions(template: WaterUseReportTemplate) {
  if (template === 'concession') {
    return [
      { value: 'lake', label: 'Lake' },
      { value: 'reservoir', label: 'Reservoir' },
      { value: 'other', label: 'Other' },
    ]
  }

  return [
    { value: 'lake', label: 'Lake' },
    { value: 'river', label: 'River' },
    { value: 'wetland', label: 'Wetland' },
    { value: 'groundwater', label: 'Groundwater' },
    { value: 'reservoir', label: 'Reservoir' },
  ]
}
