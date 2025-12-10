/**
 * ⚡ PERFORMANCE: Internal Keep-Alive mechanism to prevent cold starts
 * 
 * This runs a self-ping every 4 minutes to keep the server warm.
 * Only runs in production to avoid unnecessary pings during development.
 */

let keepAliveInterval: NodeJS.Timeout | null = null
let isInitialized = false

const PING_INTERVAL = 4 * 60 * 1000 // 4 minutes (before Railway's 5-min timeout)

async function ping() {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.RAILWAY_PUBLIC_DOMAIN
    
    if (!baseUrl) {
      console.log('⚡ Keep-alive: No base URL configured, skipping ping')
      return
    }

    const url = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`
    const response = await fetch(`${url}/api/health`, {
      method: 'HEAD', // Lightweight request
      cache: 'no-store',
    })
    
    if (response.ok) {
      console.log(`⚡ Keep-alive ping successful at ${new Date().toISOString()}`)
    }
  } catch (error) {
    // Silently fail - this is just a keep-alive, not critical
    console.log('⚡ Keep-alive ping failed (non-critical)')
  }
}

export function startKeepAlive() {
  // Only run in production
  if (process.env.NODE_ENV !== 'production') {
    console.log('⚡ Keep-alive: Skipping in development mode')
    return
  }

  // Prevent multiple initializations
  if (isInitialized) {
    return
  }
  isInitialized = true

  console.log('⚡ Keep-alive: Starting internal ping mechanism (every 4 minutes)')
  
  // Initial ping after 30 seconds (let the server fully start)
  setTimeout(() => {
    ping()
    
    // Then ping every 4 minutes
    keepAliveInterval = setInterval(ping, PING_INTERVAL)
  }, 30 * 1000)
}

export function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval)
    keepAliveInterval = null
    isInitialized = false
    console.log('⚡ Keep-alive: Stopped')
  }
}

