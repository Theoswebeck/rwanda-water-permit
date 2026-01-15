import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { WaterUseReport, WaterUseReportTemplate, WaterUseReportStatus } from '@/types/database'

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

      const { data, error } = await supabase
        .from('water_use_reports')
        .select(`
          *,
          permit:permits!permit_id(
            id, permit_number, purpose, water_source, water_allowance, allowance_unit, issued_date, expiry_date
          ),
          application:applications!application_id(
            id, application_number, project_title, intended_activities, province, district, sector, cell, village, water_body_name, max_daily_volume_m3, max_yearly_volume_m3, concession_area
          ),
          applicant:users!applicant_id(
            id, first_name, last_name, company_name, email, phone
          )
        `)
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
  })
}

// Fetch all water use reports (staff view)
export function useAllWaterUseReportsQuery(enabled: boolean = true) {
  return useQuery({
    queryKey: waterUseReportKeys.listAll(),
    queryFn: async (): Promise<WaterUseReportWithRelations[]> => {
      const { data, error } = await supabase
        .from('water_use_reports')
        .select(`
          *,
          permit:permits!permit_id(
            id, permit_number, purpose, water_source, water_allowance, allowance_unit, issued_date, expiry_date
          ),
          application:applications!application_id(
            id, application_number, project_title, intended_activities, province, district, sector, cell, village, water_body_name, max_daily_volume_m3, max_yearly_volume_m3, concession_area
          ),
          applicant:users!applicant_id(
            id, first_name, last_name, company_name, email, phone
          )
        `)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('❌ Error fetching all water use reports:', error.message)
        throw error
      }
      return data || []
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

      const { data, error } = await supabase
        .from('water_use_reports')
        .select(`
          *,
          permit:permits!permit_id(
            id, permit_number, purpose, water_source, water_allowance, allowance_unit, issued_date, expiry_date
          ),
          application:applications!application_id(
            id, application_number, project_title, intended_activities, province, district, sector, cell, village, water_body_name, max_daily_volume_m3, max_yearly_volume_m3, concession_area
          ),
          applicant:users!applicant_id(
            id, first_name, last_name, company_name, email, phone
          )
        `)
        .eq('id', id)
        .single()

      if (error) {
        console.error('❌ Error fetching water use report:', error.message)
        throw error
      }
      return data
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

      const { data, error } = await supabase
        .from('water_use_reports')
        .select('*')
        .eq('permit_id', permitId)
        .eq('reporting_year', reportingYear)
        .maybeSingle()

      if (error) {
        console.error('❌ Error checking existing report:', error.message)
        throw error
      }
      return data
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
      const { data, error } = await supabase
        .from('water_use_reports')
        .insert(reportData)
        .select()
        .single()

      if (error) {
        console.error('❌ Error creating water use report:', error.message)
        throw error
      }
      return data
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
      const { data, error } = await supabase
        .from('water_use_reports')
        .update({
          ...updateData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        console.error('❌ Error updating water use report:', error.message)
        throw error
      }
      return data
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
      const { data, error } = await supabase
        .from('water_use_reports')
        .update({
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        console.error('❌ Error submitting water use report:', error.message)
        throw error
      }
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: waterUseReportKeys.lists() })
      queryClient.invalidateQueries({ queryKey: waterUseReportKeys.detail(data.id) })
      console.log('✅ Water use report submitted:', data.id)
    },
  })
}

// Helper function to determine report template based on intended activities
export function getReportTemplate(intendedActivities: string[] | null | undefined): WaterUseReportTemplate {
  const concessionActivities = [
    'recreation',
    'fish_farming_lakes',
    'gas_extraction',
    'port',
    'navigation',
  ]

  if (!intendedActivities || intendedActivities.length === 0) {
    return 'abstraction'
  }

  const hasConcession = intendedActivities.some(activity =>
    concessionActivities.includes(activity.toLowerCase())
  )

  return hasConcession ? 'concession' : 'abstraction'
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
