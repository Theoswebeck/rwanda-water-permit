/**
 * Next.js Instrumentation File
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 * 
 * This file runs once when the server starts.
 * Used to initialize:
 * - Internal keep-alive mechanism (prevents cold starts)
 * - Any other server-side initialization
 */

export async function register() {
  // Only run keep-alive on Node.js runtime (not on edge or during build)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startKeepAlive } = await import('./lib/keep-alive')
    startKeepAlive()
  }
  
  // Edge runtime - no initialization needed
  if (process.env.NEXT_RUNTIME === 'edge') {
    // Edge runtime doesn't need keep-alive
    return
  }
}
