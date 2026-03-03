export const ALLOWED_DOCUMENT_TYPES = [
  'payment_proof',
  'identification_doc',
  'land_ownership_doc',
  'technical_drawings',
  'environmental_impact_doc',
  'intake_discharge_map',
  'water_quality_report',
  'geological_survey',
  'business_license',
  'other',
  'land_access_doc',
  'renewal_request_letter',
  'transfer_application_letter',
  'signed_transfer_form',
  'registration_certificate',
  'existing_permit_copy',
  'certified_letter',
] as const

const ALLOWED_DOCUMENT_TYPES_SET = new Set<string>(ALLOWED_DOCUMENT_TYPES)

const DOCUMENT_TYPE_ALIASES: Record<string, string> = {
  paymentProof: 'payment_proof',
  identificationDoc: 'identification_doc',
  landOwnershipDoc: 'land_ownership_doc',
  technicalDrawings: 'technical_drawings',
  environmentalImpactDoc: 'environmental_impact_doc',
  intakeDischargeMap: 'intake_discharge_map',
  landAccessDocuments: 'land_access_doc',
  renewalRequestLetter: 'renewal_request_letter',
  transferApplicationLetter: 'transfer_application_letter',
  signedTransferForm: 'signed_transfer_form',
  notifiedAgreement: 'signed_transfer_form',
  notified_agreement: 'signed_transfer_form',
  registrationCertificate: 'registration_certificate',
  existingPermitCopy: 'existing_permit_copy',
  certifiedLetter: 'certified_letter',
  fieldReport: 'other',
  field_report: 'other',
  'field-report': 'other',
  inspectionDocument: 'other',
  inspection_document: 'other',
  'inspection-document': 'other',
}

const DOCUMENT_TYPE_TO_FIELD_FALLBACK: Record<string, string> = {
  identification_doc: 'identificationDoc',
  land_ownership_doc: 'landOwnershipDoc',
  land_access_doc: 'landAccessDocuments',
  technical_drawings: 'technicalDrawings',
  environmental_impact_doc: 'environmentalImpactDoc',
  payment_proof: 'paymentProof',
  intake_discharge_map: 'intakeDischargeMap',
  business_license: 'miningLicense',
  geological_survey: 'miningHydrologicalReport',
  water_quality_report: 'waterQualityReport',
  renewal_request_letter: 'renewalRequestLetter',
  certified_letter: 'certifiedLetter',
  registration_certificate: 'registrationCertificate',
  notified_agreement: 'notifiedAgreement',
  signed_transfer_form: 'notifiedAgreement',
  existing_permit_copy: 'existingPermitCopy',
}

export function safeStorageToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export function toSnakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase()
}

export function snakeToCamel(value: string): string {
  const parts = value.split('_').filter(Boolean)
  if (!parts.length) return value
  return parts[0] + parts.slice(1).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('')
}

export function normalizeDocumentType(raw: string): string {
  const value = raw.trim()
  if (!value) return 'other'

  if (ALLOWED_DOCUMENT_TYPES_SET.has(value)) return value
  if (DOCUMENT_TYPE_ALIASES[value]) return DOCUMENT_TYPE_ALIASES[value]

  const snake = toSnakeCase(value)
  if (ALLOWED_DOCUMENT_TYPES_SET.has(snake)) return snake
  if (DOCUMENT_TYPE_ALIASES[snake]) return DOCUMENT_TYPE_ALIASES[snake]

  if (snake.endsWith('_hydrological_report')) return 'geological_survey'
  if (snake.endsWith('_eia')) return 'environmental_impact_doc'
  if (
    snake.endsWith('_general_requirements') ||
    snake.endsWith('_feasibility_study') ||
    snake.endsWith('_management_plan') ||
    snake.endsWith('_recommendation_letter') ||
    snake.endsWith('_waste_management_plan')
  ) {
    return 'other'
  }

  return 'other'
}

export function extractFieldTokenFromFilePath(filePath: string): string | null {
  const fileName = extractFileNameFromPath(filePath)
  if (!fileName) return null
  const match = fileName.match(/^(.+)-\d+\.[^.]+$/)
  if (!match?.[1]) return null
  const marker = match[1]
  // Keep additional_* tokens as-is for dynamic documents.
  if (marker.startsWith('additional_')) return marker
  // Keep camelCase tokens as-is.
  if (!marker.includes('_')) return marker
  return snakeToCamel(marker)
}

export function extractFileNameFromPath(filePath: string): string {
  try {
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      return new URL(filePath).pathname.split('/').pop() || ''
    }
  } catch {
    // Fall through to plain path handling.
  }
  return filePath.split('/').pop() || ''
}

export function resolveDocumentFieldFallback(docType: string): string {
  return DOCUMENT_TYPE_TO_FIELD_FALLBACK[docType] || docType
}

export function resolveDocumentFieldToken(filePath: string, docType: string): string {
  return extractFieldTokenFromFilePath(filePath) || resolveDocumentFieldFallback(docType)
}

export function buildDocumentLookupPathPatterns(applicationId: string, fieldToken: string): string[] {
  const safeToken = safeStorageToken(fieldToken)
  const snakeToken = toSnakeCase(fieldToken)
  const candidates = new Set<string>([safeToken, snakeToken])
  const patterns: string[] = []
  candidates.forEach((token) => {
    patterns.push(`%application-documents/${applicationId}/${token}-%`)
    patterns.push(`%applications/${applicationId}/${token}-%`)
  })
  return patterns
}
