import type { Application, Permit, WaterUseReportTemplate, User } from '@/types/database'
import { PURE_CONCESSION_ACTIVITIES } from '@/lib/permit-variant'

/**
 * Activities that occupy a water body rather than abstract from it, and so
 * report on the concession template: the canonical pure-concession activities
 * (PURE_CONCESSION_ACTIVITIES) plus spelling variants, because
 * `permit.purpose` and `application.intended_activities` are populated by
 * different code paths and disagree on some of them.
 *
 * Single source of truth for reporting — `getReportTemplate()` in
 * hooks/useWaterUseReports delegates here rather than keeping a second copy.
 */
export const CONCESSION_ACTIVITIES = new Set<string>([
  ...PURE_CONCESSION_ACTIVITIES,
  // Spelling variants seen in legacy `permit.purpose` values:
  'recreation',
  'gas_extraction',
  'port',
])

export function isConcessionActivity(value?: string | null): boolean {
  if (!value) return false
  return CONCESSION_ACTIVITIES.has(value.trim().toLowerCase())
}

/**
 * Resolve the reporting template from BOTH the permit purpose and the
 * application's intended activities — either one indicating a concession
 * activity is enough.
 *
 * Checking only intended_activities used to mis-resolve real permits: e.g.
 * 000018/RWB/2026 has purpose 'recreation' (concession) but its activities are
 * ["navigation"], so it rendered the abstraction template.
 */
export function selectWaterUseReportTemplate(args: {
  permitPurpose?: Permit['purpose'] | null
  applicationIntendedActivities?: Application['intended_activities'] | null
}): WaterUseReportTemplate {
  if (isConcessionActivity(args.permitPurpose)) return 'concession'

  const activities = args.applicationIntendedActivities
  if (Array.isArray(activities) && activities.some(isConcessionActivity)) {
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


