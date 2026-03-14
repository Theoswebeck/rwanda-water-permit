import { NextRequest, NextResponse } from 'next/server'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { query } from '@/lib/db/postgres'
import { clearSessionCookie, readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'
import { normalizeDocumentType, safeStorageToken } from '@/lib/documents/upload-mapping'
import { isEffectiveStaffUser, resolveEffectiveRoles } from '@/lib/auth/effective-roles'

export const runtime = 'nodejs'

async function getClaims(req: NextRequest) {
  const token = readSessionTokenFromRequest(req)
  if (!token) return null
  return verifySessionToken(token)
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_')
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

async function isStaffUser(userId: string): Promise<boolean> {
  const resolved = await resolveEffectiveRoles({ userId })
  return isEffectiveStaffUser(resolved.effectiveRoles)
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const claims = await getClaims(req)
    if (!claims?.sub) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 })
    }

    const { id: applicationId } = await context.params
    const [owned, staff] = await Promise.all([
      assertApplicationOwnership(applicationId, claims.sub),
      isStaffUser(claims.sub),
    ])
    if (!owned && !staff) {
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
    const [owned, staff] = await Promise.all([
      assertApplicationOwnership(applicationId, claims.sub),
      isStaffUser(claims.sub),
    ])
    if (!owned && !staff) {
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

    // Keep the original field token in filename so UI can map documents
    // back to their exact form field (especially for shared enum types like "other").
    const fileMarker = safeStorageToken(typeRaw || docType || 'other')
    const diskName = `${fileMarker}-${now}${safeSegment(ext)}`
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
