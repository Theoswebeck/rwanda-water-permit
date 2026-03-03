import { NextRequest, NextResponse } from 'next/server'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { query } from '@/lib/db/postgres'
import { clearSessionCookie, readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'

export const runtime = 'nodejs'

const ALLOWED_DOCUMENT_TYPES = new Set([
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
])

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
  registrationCertificate: 'registration_certificate',
  existingPermitCopy: 'existing_permit_copy',
  certifiedLetter: 'certified_letter',
}

async function getClaims(req: NextRequest) {
  const token = readSessionTokenFromRequest(req)
  if (!token) return null
  return verifySessionToken(token)
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function toSnakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase()
}

function normalizeDocumentType(raw: string): string {
  const value = raw.trim()
  if (!value) return 'other'

  if (ALLOWED_DOCUMENT_TYPES.has(value)) return value
  if (DOCUMENT_TYPE_ALIASES[value]) return DOCUMENT_TYPE_ALIASES[value]

  const snake = toSnakeCase(value)
  if (ALLOWED_DOCUMENT_TYPES.has(snake)) return snake

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

async function assertApplicationOwnership(applicationId: string, userId: string): Promise<boolean> {
  const res = await query(
    `
    select id
    from public.applications
    where id = $1 and applicant_id = $2
    limit 1
    `,
    [applicationId, userId]
  )
  return Boolean(res.rows[0]?.id)
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const claims = await getClaims(req)
    if (!claims?.sub) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 })
    }

    const { id: applicationId } = await context.params
    const owned = await assertApplicationOwnership(applicationId, claims.sub)
    if (!owned) {
      return NextResponse.json({ success: false, message: 'Application not found' }, { status: 404 })
    }

    const docs = await query(
      `
      select *
      from public.documents
      where application_id = $1
      order by created_at desc
      `,
      [applicationId]
    )
    return NextResponse.json({ success: true, documents: docs.rows })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    if (message.includes('Invalid session') || message.includes('JWT')) {
      const res = NextResponse.json({ success: false, message: 'Invalid session' }, { status: 401 })
      clearSessionCookie(res)
      return res
    }
    console.error('❌ dashboard documents GET error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const claims = await getClaims(req)
    if (!claims?.sub) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 })
    }

    const { id: applicationId } = await context.params
    const owned = await assertApplicationOwnership(applicationId, claims.sub)
    if (!owned) {
      return NextResponse.json({ success: false, message: 'Application not found' }, { status: 404 })
    }

    const form = await req.formData()
    const file = form.get('file')
    const typeRaw = String(form.get('documentType') || '').trim()
    const docType = normalizeDocumentType(typeRaw)
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, message: 'File is required' }, { status: 400 })
    }

    const bytes = Buffer.from(await file.arrayBuffer())
    const now = Date.now()
    const ext = path.extname(file.name || '').trim() || ''
    const dirRel = path.join('uploads', 'application-documents', safeSegment(applicationId))
    const dirAbs = path.join(process.cwd(), 'public', dirRel)
    await mkdir(dirAbs, { recursive: true })

    const diskName = `${safeSegment(docType)}_${now}${safeSegment(ext)}`
    const fileAbs = path.join(dirAbs, diskName)
    await writeFile(fileAbs, bytes)

    const filePath = `/${path.join(dirRel, diskName).replaceAll(path.sep, '/')}`
    const insertSql = `
      insert into public.documents (
        application_id,
        type,
        name,
        file_path,
        file_size,
        mime_type,
        uploaded_by,
        verification_status,
        created_at,
        updated_at
      ) values (
        $1, $2, $3, $4, $5, $6, $7, 'pending', now(), now()
      )
      returning *
    `
    let insertRes
    try {
      insertRes = await query(insertSql, [
        applicationId,
        docType,
        file.name || diskName,
        filePath,
        file.size || bytes.length,
        file.type || null,
        claims.sub,
      ])
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code || '')
        : ''
      // Final safety net: never fail upload due to an unknown document type token.
      if (code === '22P02' && message.includes('enum document_type') && docType !== 'other') {
        insertRes = await query(insertSql, [
          applicationId,
          'other',
          file.name || diskName,
          filePath,
          file.size || bytes.length,
          file.type || null,
          claims.sub,
        ])
      } else {
        throw error
      }
    }

    return NextResponse.json({ success: true, document: insertRes.rows[0] || null })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    if (message.includes('Invalid session') || message.includes('JWT')) {
      const res = NextResponse.json({ success: false, message: 'Invalid session' }, { status: 401 })
      clearSessionCookie(res)
      return res
    }
    console.error('❌ dashboard documents POST error:', err)
    return NextResponse.json({ success: false, message: message }, { status: 500 })
  }
}
