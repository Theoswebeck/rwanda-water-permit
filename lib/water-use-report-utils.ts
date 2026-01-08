import type { Application, Permit, WaterUseReportTemplate, User } from '@/types/database'

export function selectWaterUseReportTemplate(args: {
  permitPurpose?: Permit['purpose'] | null
  applicationIntendedActivities?: Application['intended_activities'] | null
}): WaterUseReportTemplate {
  const purpose = args.permitPurpose || undefined

  // Concession template is used for lake concession-style permits.
  // Current supported mapping (can be expanded later):
  // - fish_farming_lakes (cages in lake)
  // - recreation
  if (purpose === 'fish_farming_lakes' || purpose === 'recreation') {
    return 'concession'
  }

  return 'abstraction'
}

export function formatPermitHolderName(user?: Partial<User> | null) {
  if (!user) return ''

  const company = (user as any).company_name as string | undefined
  if (company) return company

  const first = (user as any).first_name as string | undefined
  const last = (user as any).last_name as string | undefined
  const full = `${first || ''} ${last || ''}`.trim()
  if (full) return full

  return (user as any).email || ''
}

export interface WaterUseReportGeneralInfo {
  permitHolderName: string
  permitNumber: string
  permitIssueDate: string
  permitExpiryDate: string
  reportingYear: number
  waterUseType: string
  waterSourceType: string
  waterBodyName: string
  location: {
    province: string
    district: string
    sector: string
    cell: string
    village?: string
  }
  contact: {
    name: string
    position: string
    telephone: string
    email: string
  }
  permitted: {
    maxAbstractionRate_m3_day?: number | null
    authorizedAnnualVolume_m3_year?: number | null
    authorizedLakeSurfaceArea_ha?: number | null
  }
}

export function buildWaterUseReportGeneralInfo(args: {
  permit: Permit
  application: Application
  user?: Partial<User> | null
  reportingYear: number
}): WaterUseReportGeneralInfo {
  const { permit, application, user, reportingYear } = args

  return {
    permitHolderName: formatPermitHolderName(user),
    permitNumber: permit.permit_number,
    permitIssueDate: permit.issued_date,
    permitExpiryDate: permit.expiry_date,
    reportingYear,
    waterUseType: permit.purpose,
    waterSourceType: permit.water_source,
    waterBodyName: application.water_body_name || '',
    location: {
      province: application.province,
      district: application.district,
      sector: application.sector,
      cell: application.cell,
      village: application.village || undefined,
    },
    contact: {
      name: formatPermitHolderName(user),
      position: '',
      telephone: (user as any)?.phone || (user as any)?.mobile_phone || (user as any)?.company_phone || '',
      email: (user as any)?.email || '',
    },
    permitted: {
      // From application schema update (preferred)
      maxAbstractionRate_m3_day: application.max_daily_volume_m3 ?? null,
      authorizedAnnualVolume_m3_year: application.max_yearly_volume_m3 ?? null,
      // Concession
      authorizedLakeSurfaceArea_ha: application.concession_area ?? null,
    },
  }
}


