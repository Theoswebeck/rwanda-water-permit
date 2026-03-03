import { NextRequest, NextResponse } from 'next/server'
import path from 'node:path'
import { unlink } from 'node:fs/promises'
import { query } from '@/lib/db/postgres'
import { clearSessionCookie, readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'

export const runtime = 'nodejs'

async function getUserId(req: NextRequest): Promise<string | null> {
  const token = readSessionTokenFromRequest(req)
  if (!token) return null
  const claims = await verifySessionToken(token)
  return claims?.sub || null
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getUserId(req)
    if (!userId) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 })
    }

    const { id } = await context.params
    const docRes = await query<{ id: string; file_path: string | null }>(
      `
      select d.id, d.file_path
      from public.documents d
      join public.applications a on a.id = d.application_id
      where d.id = $1 and a.applicant_id = $2
      limit 1
      `,
      [id, userId]
    )
    const doc = docRes.rows[0]
    if (!doc) {
      return NextResponse.json({ success: false, message: 'Document not found' }, { status: 404 })
    }

    await query(`delete from public.documents where id = $1`, [id])

    if (doc.file_path?.startsWith('/uploads/')) {
      const abs = path.join(process.cwd(), 'public', doc.file_path.replace(/^\/+/, ''))
      await unlink(abs).catch(() => undefined)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    if (message.includes('Invalid session') || message.includes('JWT')) {
      const res = NextResponse.json({ success: false, message: 'Invalid session' }, { status: 401 })
      clearSessionCookie(res)
      return res
    }
    console.error('❌ dashboard documents DELETE error:', err)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}
