import { NextRequest, NextResponse } from 'next/server'
import { verifyTin } from '@/lib/rra/client'

export async function POST(req: NextRequest) {
  const enabled = process.env.RRA_VERIFICATION_ENABLED === 'true'
  if (!enabled) {
    console.warn('❌ RRA verify called but RRA_VERIFICATION_ENABLED is not true')
    return NextResponse.json({ success: false, message: 'RRA verification is currently disabled' }, { status: 503 })
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
    const message = e instanceof Error ? e.message : 'Unknown error'
    console.error(`❌ RRA TIN verification failed for request:`, message)

    let userMessage = 'TIN could not be verified. Please try again later.'
    if (message.includes('Missing required environment variable')) {
      console.error('❌ RRA integration is misconfigured — check RRA_BASE_URL, RRA_USERNAME, RRA_PASSWORD env vars')
      userMessage = 'TIN verification service is not configured. Please contact support.'
    } else if (message.includes('RRA authentication failed')) {
      console.error('❌ RRA authentication failed — credentials may be invalid')
      userMessage = 'TIN verification service is temporarily unavailable. Please try again later.'
    } else if (message.includes('No details found for tin')) {
      userMessage = 'No taxpayer found for the provided TIN. Please verify and try again.'
    } else if (message.includes('fetch failed') || message.includes('ECONNREFUSED') || message.includes('ETIMEDOUT')) {
      console.error('❌ Cannot reach RRA API — check network connectivity to', process.env.RRA_BASE_URL)
      userMessage = 'TIN verification service is unreachable. Please try again later.'
    }

    return NextResponse.json({ success: false, message: userMessage }, { status: 400 })
  }
}
