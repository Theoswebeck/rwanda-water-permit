import { NextResponse } from 'next/server'
import packageJson from '@/package.json'

/**
 * ⚡ PERFORMANCE: Health check endpoint for:
 * 1. Railway health checks (keeps container alive)
 * 2. External monitoring (UptimeRobot, Better Uptime, etc.)
 * 3. Load balancer health checks
 * 
 * This endpoint is lightweight and doesn't require authentication.
 */

export const runtime = 'nodejs' // Use nodejs for consistency with the rest of the app
export const dynamic = 'force-dynamic' // Don't cache this response

export async function GET() {
  const uptimeSeconds = process.uptime()
  const healthCheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: `${uptimeSeconds}s`,
    environment: process.env.NODE_ENV || 'development',
    version:
      process.env.npm_package_version ||
      process.env.NEXT_PUBLIC_APP_VERSION ||
      packageJson.version ||
      '1.0.0',
  }

  return NextResponse.json(healthCheck, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}

// Also support HEAD requests (lighter weight for monitoring)
export async function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}

