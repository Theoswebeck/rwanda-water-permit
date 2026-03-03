import { NextRequest, NextResponse } from 'next/server'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { readSessionTokenFromRequest, verifySessionToken } from '@/lib/auth/session'

export const runtime = 'nodejs'

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export async function POST(req: NextRequest) {
  try {
    const token = readSessionTokenFromRequest(req)
    const claims = token ? await verifySessionToken(token) : null
    if (!claims?.sub) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
    }

    const form = await req.formData()
    const file = form.get('file')
    const permitId = String(form.get('permitId') || '').trim()
    const kindRaw = String(form.get('kind') || 'permit').trim().toLowerCase()
    const labelRaw = String(form.get('label') || '').trim()
    const kind = kindRaw === 'terms' ? 'terms' : 'permit'

    if (!(file instanceof File) || !permitId) {
      return NextResponse.json({ success: false, message: 'Missing file or permitId' }, { status: 400 })
    }

    const bytes = Buffer.from(await file.arrayBuffer())
    const ext = path.extname(file.name || '.pdf') || '.pdf'
    const safeName = `${kind}-${safeSegment(labelRaw || String(Date.now()))}${safeSegment(ext)}`
    const relDir = path.join('uploads', 'permits', safeSegment(permitId))
    const absDir = path.join(process.cwd(), 'public', relDir)
    await mkdir(absDir, { recursive: true })
    const absFile = path.join(absDir, safeName)
    await writeFile(absFile, bytes)
    const relPath = `/${path.join(relDir, safeName).replaceAll(path.sep, '/')}`

    return NextResponse.json({ success: true, path: relPath, url: relPath })
  } catch (error) {
    console.error('❌ files/upload error:', error)
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 })
  }
}
