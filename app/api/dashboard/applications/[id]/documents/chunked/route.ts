import { NextRequest, NextResponse } from 'next/server'
import path from 'node:path'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { query } from '@/lib/db/postgres'
import { clearSessionCookie, readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'
import { normalizeDocumentType, safeStorageToken } from '@/lib/documents/upload-mapping'

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
  const res = await query<{ role: string | null }>(
    `
    select role
    from public.users
    where id = $1
    limit 1
    `,
    [userId]
  )
  const role = String(res.rows[0]?.role || '').toLowerCase()
  return ['reviewer', 'verifier', 'approver', 'assessor', 'inspector', 'admin'].includes(role)
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  let tempDirAbs: string | null = null

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
    const chunk = form.get('chunk')
    const uploadId = safeSegment(String(form.get('uploadId') || '').trim())
    const chunkIndexRaw = Number.parseInt(String(form.get('chunkIndex') || ''), 10)
    const totalChunksRaw = Number.parseInt(String(form.get('totalChunks') || ''), 10)
    const fileName = String(form.get('filename') || 'document').trim() || 'document'
    const mimeType = String(form.get('mimeType') || '').trim() || null
    const fileSizeRaw = Number.parseInt(String(form.get('fileSize') || ''), 10)
    const typeRaw = String(form.get('documentType') || '').trim()
    const docType = normalizeDocumentType(typeRaw)

    if (!(chunk instanceof File)) {
      return NextResponse.json({ success: false, message: 'Chunk is required' }, { status: 400 })
    }
    if (!uploadId) {
      return NextResponse.json({ success: false, message: 'uploadId is required' }, { status: 400 })
    }
    if (!Number.isInteger(chunkIndexRaw) || chunkIndexRaw < 0) {
      return NextResponse.json({ success: false, message: 'Invalid chunkIndex' }, { status: 400 })
    }
    if (!Number.isInteger(totalChunksRaw) || totalChunksRaw <= 0) {
      return NextResponse.json({ success: false, message: 'Invalid totalChunks' }, { status: 400 })
    }
    if (chunkIndexRaw >= totalChunksRaw) {
      return NextResponse.json({ success: false, message: 'chunkIndex out of range' }, { status: 400 })
    }

    const tempDirRel = path.join('.tmp', 'upload-chunks', safeSegment(applicationId), uploadId)
    tempDirAbs = path.join(process.cwd(), tempDirRel)
    await mkdir(tempDirAbs, { recursive: true })
    const chunkAbs = path.join(tempDirAbs, `chunk-${chunkIndexRaw.toString().padStart(6, '0')}`)
    const chunkBytes = Buffer.from(await chunk.arrayBuffer())
    await writeFile(chunkAbs, chunkBytes)

    const isFinalChunk = chunkIndexRaw === totalChunksRaw - 1
    if (!isFinalChunk) {
      return NextResponse.json({ success: true, completed: false, chunkIndex: chunkIndexRaw, totalChunks: totalChunksRaw })
    }

    const chunkFiles = (await readdir(tempDirAbs))
      .filter((name) => name.startsWith('chunk-'))
      .sort()

    if (chunkFiles.length !== totalChunksRaw) {
      return NextResponse.json(
        {
          success: false,
          message: `Missing chunk(s). Expected ${totalChunksRaw}, received ${chunkFiles.length}.`,
        },
        { status: 409 }
      )
    }

    const partBuffers: Buffer[] = []
    for (const chunkFile of chunkFiles) {
      partBuffers.push(await readFile(path.join(tempDirAbs, chunkFile)))
    }
    const fullBytes = Buffer.concat(partBuffers)
    const declaredSize = Number.isInteger(fileSizeRaw) && fileSizeRaw >= 0 ? fileSizeRaw : fullBytes.length
    if (declaredSize !== fullBytes.length) {
      return NextResponse.json({ success: false, message: 'Chunk size mismatch' }, { status: 400 })
    }

    const now = Date.now()
    const ext = path.extname(fileName || '').trim() || ''
    const dirRel = path.join('uploads', 'application-documents', safeSegment(applicationId))
    const dirAbs = path.join(process.cwd(), 'public', dirRel)
    await mkdir(dirAbs, { recursive: true })

    const fileMarker = safeStorageToken(typeRaw || docType || 'other')
    const diskName = `${fileMarker}-${now}${safeSegment(ext)}`
    const fileAbs = path.join(dirAbs, diskName)
    await writeFile(fileAbs, fullBytes)

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
        fileName || diskName,
        filePath,
        declaredSize,
        mimeType,
        claims.sub,
      ])
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code || '')
        : ''
      if (code === '22P02' && message.includes('enum document_type') && docType !== 'other') {
        insertRes = await query(insertSql, [
          applicationId,
          'other',
          fileName || diskName,
          filePath,
          declaredSize,
          mimeType,
          claims.sub,
        ])
      } else {
        throw error
      }
    }

    await rm(tempDirAbs, { recursive: true, force: true })
    tempDirAbs = null

    return NextResponse.json({ success: true, document: insertRes.rows[0] || null, completed: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    if (message.includes('Invalid session') || message.includes('JWT')) {
      const res = NextResponse.json({ success: false, message: 'Invalid session' }, { status: 401 })
      clearSessionCookie(res)
      return res
    }
    console.error('❌ dashboard documents chunked POST error:', err)
    return NextResponse.json({ success: false, message }, { status: 500 })
  } finally {
    if (tempDirAbs) {
      await rm(tempDirAbs, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}
