import { NextRequest, NextResponse } from 'next/server'
import { verifyNationalId } from '@/lib/nida/gesb'

export async function POST(req: NextRequest) {
  const enabled = process.env.NIDA_VERIFICATION_ENABLED === 'true'
  if (!enabled) {
    return NextResponse.json({ success: false, message: 'NIDA verification is disabled' }, { status: 400 })
  }

  try {
    const body = (await req.json().catch(() => null)) as { documentNumber?: string } | null
    const documentNumber = String(body?.documentNumber ?? '').trim()
    if (!documentNumber) {
      return NextResponse.json({ success: false, message: 'Missing documentNumber' }, { status: 400 })
    }

    const v = await verifyNationalId(documentNumber)
    return NextResponse.json({ success: true, data: v })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'National ID could not be verified'
    const safeMessage =
      process.env.NODE_ENV === 'production' ? 'National ID could not be verified' : `National ID verification failed: ${message}`
    return NextResponse.json({ success: false, message: safeMessage }, { status: 400 })
  }
}

