import { NextResponse } from 'next/server'

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
  const healthCheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
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

