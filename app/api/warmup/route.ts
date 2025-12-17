import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type WarmupRouteResult = {
  route: string
  status: number | 'error'
  duration: string
  success: boolean
  error?: string
}

function getWarmupRoutes(): string[] {
  const fromEnv = process.env.WARMUP_ROUTES
  if (!fromEnv) return ['/api/health']

  const parsed = fromEnv
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean)

  return parsed.length ? parsed : ['/api/health']
}

export async function GET(request: Request) {
  const startTime = Date.now()
  const timestamp = new Date().toISOString()

  // Prefer deriving origin from the incoming request so this works on
  // Railway/Vercel/local without hardcoding base URLs.
  const origin = new URL(request.url).origin
  const routes = getWarmupRoutes()

  const results: WarmupRouteResult[] = []

  for (const route of routes) {
    const routeStart = Date.now()
    try {
      const res = await fetch(`${origin}${route}`, {
        method: 'GET',
        headers: { 'User-Agent': 'Warmup-Bot' },
        cache: 'no-store',
      })

      results.push({
        route,
        status: res.status,
        duration: `${Date.now() - routeStart}ms`,
        success: res.ok,
      })
    } catch (e: unknown) {
      results.push({
        route,
        status: 'error',
        duration: `${Date.now() - routeStart}ms`,
        success: false,
        error: e instanceof Error ? e.message : 'Unknown error',
      })
    }
  }

  return NextResponse.json(
    {
      status: 'warmup-complete',
      timestamp,
      totalDuration: `${Date.now() - startTime}ms`,
      origin,
      routes: results,
      warmedRoutes: results.filter((r) => r.success).length,
      totalRoutes: results.length,
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  )
}


