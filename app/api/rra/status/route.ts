import { NextResponse } from 'next/server'

export async function GET() {
  const enabled = process.env.RRA_VERIFICATION_ENABLED === 'true'
  return NextResponse.json({ enabled })
}
