import { NextRequest, NextResponse } from 'next/server'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { query } from '@/lib/db/postgres'
import { clearSessionCookie, readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'

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
    const docType = typeRaw || 'other'
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
    const insertRes = await query(
      `
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
      `,
      [applicationId, docType, file.name || diskName, filePath, file.size || bytes.length, file.type || null, claims.sub]
    )

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
