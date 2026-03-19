import { NextRequest, NextResponse } from 'next/server'
import { verifyTin } from '@/lib/rra/client'

export async function POST(req: NextRequest) {
  const enabled = process.env.RRA_VERIFICATION_ENABLED === 'true'
  if (!enabled) {
    return NextResponse.json({ success: false, message: 'RRA verification is disabled' }, { status: 400 })
  }

  try {
    const body = (await req.json().catch(() => null)) as { tin?: string } | null
    const tin = String(body?.tin ?? '').trim()
    if (!tin) {
      return NextResponse.json({ success: false, message: 'Missing TIN' }, { status: 400 })
    }

    const digits = tin.replace(/\D/g, '')
    if (digits.length !== 9) {
      return NextResponse.json({ success: false, message: 'TIN must be exactly 9 digits' }, { status: 400 })
    }

    const data = await verifyTin(digits)
    return NextResponse.json({ success: true, data })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'TIN could not be verified'
    const safeMessage =
      process.env.NODE_ENV === 'production' ? 'TIN could not be verified' : `TIN verification failed: ${message}`
    return NextResponse.json({ success: false, message: safeMessage }, { status: 400 })
  }
}
